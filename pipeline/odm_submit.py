"""Submit a folder of geotagged drone photos to NodeODM for a full reconstruction.

The options produce everything the viewer uses: textured 3D Tiles mesh, DSM, DTM,
orthophoto, and the OpenSfM alignment the splat trainer reads. They are tuned for quality on
a 16-core / 32 GB / RTX 3080 machine; see pipeline/README.md for the memory settings they need.

Usage: python odm_submit.py <images_dir> --name "Callis Road 2026-08-30" [--node http://127.0.0.1:3001]
Writes <images_dir>/../<name>.task.json with the task UUID.
"""
import argparse
import json
import time
from pathlib import Path

import requests

OPTIONS = {
    'dsm': True, 'dtm': True, 'cog': True, '3d-tiles': True, 'gltf': True, 'pc-ept': True,
    'fast-orthophoto': False, 'skip-3dmodel': False,
    # Keep opensfm/ and the undistorted images: the splat trainer needs them.
    'optimize-disk-space': False,
    'feature-quality': 'ultra', 'min-num-features': 16000,
    'pc-quality': 'high',
    'mesh-octree-depth': 12, 'mesh-size': 400000,
    'dem-resolution': 2, 'orthophoto-resolution': 1,
    'auto-boundary': True,
    # One texture atlas per mesh tile. Without it each 3D Tiles tile carried ~100 separate
    # textures (up to 86 MB per tile) and browsers ran out of GPU memory decoding them.
    'texturing-single-material': True,
    'max-concurrency': 16,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('images', type=Path)
    ap.add_argument('--name', required=True)
    ap.add_argument('--node', default='http://127.0.0.1:3001')
    args = ap.parse_args()

    images = sorted(p for p in args.images.iterdir() if p.suffix.lower() in ('.jpg', '.jpeg', '.tif', '.tiff'))
    if not images:
        raise SystemExit(f'No images in {args.images}')
    record = args.images.parent / f'{args.name}.task.json'
    if record.exists():
        raise SystemExit(f'{record} exists; inspect it before resubmitting.')

    available = {o['name'] for o in requests.get(f'{args.node}/options', timeout=30).json()}
    missing = set(OPTIONS) - available
    if missing:
        raise SystemExit(f'NodeODM does not support: {sorted(missing)}')
    options = [{'name': k, 'value': v} for k, v in OPTIONS.items()]

    def post(endpoint, **kw):
        r = requests.post(args.node + endpoint, timeout=(10, 300), **kw)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict) and data.get('error'):
            raise RuntimeError(data['error'])
        return data

    uid = post('/task/new/init', files={'name': (None, args.name), 'options': (None, json.dumps(options))})['uuid']
    meta = {'uuid': uid, 'name': args.name, 'images': len(images), 'options': options, 'submitted': time.time()}
    record.write_text(json.dumps(meta, indent=2))
    for i in range(0, len(images), 8):
        batch = images[i:i + 8]
        handles = [p.open('rb') for p in batch]
        try:
            post(f'/task/new/upload/{uid}', files=[('images', (p.name, h, 'image/jpeg')) for p, h in zip(batch, handles)])
        finally:
            for h in handles:
                h.close()
        print(f'uploaded {min(i + 8, len(images))}/{len(images)}', flush=True)
    post(f'/task/new/commit/{uid}')
    print('TASK', uid)


if __name__ == '__main__':
    main()
