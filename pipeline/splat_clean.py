"""Crop a trained OpenSplat PLY to the field and drop floaters, ready for tiling.

OpenSplat trained on ODM's topocentric reconstruction writes positions in local ENU metres
around opensfm/reference_lla.json (altitude 0 on the WGS84 ellipsoid). This keeps that frame,
so one ENU->ECEF transform at the reference point places the splat on the globe.

Keeps Gaussians that are inside the field polygon (plus a margin), within a height band
around the ground, and not near-transparent. Writes a binary PLY with a `z-up` comment,
which 3dgs-ply-3dtiles-converter reads as ENU.

Usage: python splat_clean.py in.ply reference_lla.json boundary.geojson out.ply [--margin 15]
"""
import argparse
import json
import math

import numpy as np

EARTH_RADIUS = 6378137.0


def read_ply(path):
    with open(path, 'rb') as f:
        header = []
        while True:
            line = f.readline().decode('ascii').strip()
            header.append(line)
            if line == 'end_header':
                break
        count = next(int(l.split()[2]) for l in header if l.startswith('element vertex'))
        props = [l.split()[2] for l in header if l.startswith('property float')]
        data = np.frombuffer(f.read(count * 4 * len(props)), dtype='<f4').reshape(count, len(props))
    return props, data.copy()


def write_ply(path, props, data):
    header = ['ply', 'format binary_little_endian 1.0', 'comment z-up',
              'comment ENU metres about opensfm reference_lla (WGS84 ellipsoid altitude 0)',
              f'element vertex {len(data)}', *[f'property float {p}' for p in props], 'end_header']
    with open(path, 'wb') as f:
        f.write(('\n'.join(header) + '\n').encode('ascii'))
        f.write(data.astype('<f4').tobytes())


def to_enu(lon, lat, lon0, lat0):
    # Equirectangular about the reference: sub-centimetre over a few hundred metres.
    x = math.radians(lon - lon0) * EARTH_RADIUS * math.cos(math.radians(lat0))
    y = math.radians(lat - lat0) * EARTH_RADIUS
    return x, y


def inside(px, py, poly):
    """Vectorized even-odd point-in-polygon test."""
    result = np.zeros(len(px), dtype=bool)
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        crosses = ((y1 > py) != (y2 > py)) & (px < (x2 - x1) * (py - y1) / ((y2 - y1) or 1e-12) + x1)
        result ^= crosses
    return result


def buffered(poly, margin):
    cx = sum(p[0] for p in poly) / len(poly)
    cy = sum(p[1] for p in poly) / len(poly)
    out = []
    for x, y in poly:
        d = math.hypot(x - cx, y - cy) or 1
        out.append((x + (x - cx) / d * margin, y + (y - cy) / d * margin))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ply')
    ap.add_argument('reference_lla')
    ap.add_argument('boundary')
    ap.add_argument('out')
    ap.add_argument('--margin', type=float, default=15)
    ap.add_argument('--min-opacity', type=float, default=0.05)
    args = ap.parse_args()

    ref = json.load(open(args.reference_lla))
    lat0, lon0 = ref['latitude'], ref['longitude']
    geom = json.load(open(args.boundary))['features'][0]['geometry']
    ring = geom['coordinates'][0] if geom['type'] == 'Polygon' else geom['coordinates'][0][0]
    poly = buffered([to_enu(lon, lat, lon0, lat0) for lon, lat, *_ in ring], args.margin)

    props, data = read_ply(args.ply)
    col = {p: i for i, p in enumerate(props)}
    x, y, z = data[:, col['x']], data[:, col['y']], data[:, col['z']]
    opacity = 1 / (1 + np.exp(-data[:, col['opacity']]))

    keep = inside(x, y, poly) & (opacity >= args.min_opacity)
    # Height band: from just below the ground to treetop height, judged on the kept points.
    ground = np.percentile(z[keep], 2)
    keep &= (z > ground - 3) & (z < ground + 45)

    write_ply(args.out, props, data[keep])
    print(json.dumps({'in': len(data), 'out': int(keep.sum()), 'ground_ellipsoidal_m': round(float(ground), 2),
                      'reference': {'latitude': lat0, 'longitude': lon0, 'altitude': ref.get('altitude', 0)}}))


if __name__ == '__main__':
    main()
