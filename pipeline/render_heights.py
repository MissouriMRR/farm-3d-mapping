"""Render ODM elevation models into the viewer's colour-ramped height overlays.

Runs inside the GDAL container (see pipeline/README.md). Reads the DSM and DTM GeoTIFFs,
derives canopy height (DSM minus DTM on the DSM grid), reprojects to EPSG:4326, and writes
RGBA PNG overlays plus heights.json with the shared bounds and each ramp's range.

Heights stay WGS84 ellipsoidal, as ODM writes them; the viewer converts for display.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from osgeo import gdal

gdal.UseExceptions()

MAX_PIXELS = 4096  # longest overlay side; keeps the single tile within WebGL texture limits


def hex_rgb(value):
    value = value.lstrip('#')
    return [int(value[i:i + 2], 16) for i in (0, 2, 4)]


def ramp_rgba(data, lo, hi, stops):
    """Linear interpolation through evenly spaced colour stops; NaN becomes transparent."""
    colours = np.array([hex_rgb(s) for s in stops], dtype=np.float32)
    missing = np.isnan(data)
    data = np.where(missing, lo, data)
    t = np.clip((data - lo) / max(hi - lo, 1e-6), 0, 1) * (len(stops) - 1)
    i = np.clip(np.floor(t).astype(int), 0, len(stops) - 2)
    f = (t - i)[..., None]
    rgb = colours[i] * (1 - f) + colours[i + 1] * f
    alpha = np.where(missing, 0, 255)[..., None]
    return np.concatenate([rgb, alpha], axis=-1).astype(np.uint8)


def warp_to_4326(src, dst, like=None):
    opts = dict(dstSRS='EPSG:4326', resampleAlg='bilinear', dstNodata=np.nan, outputType=gdal.GDT_Float32)
    if like is not None:
        gt = like.GetGeoTransform()
        opts.update(outputBounds=(gt[0], gt[3] + gt[5] * like.RasterYSize, gt[0] + gt[1] * like.RasterXSize, gt[3]),
                    width=like.RasterXSize, height=like.RasterYSize)
    else:
        info = gdal.Warp('', src, format='VRT', dstSRS='EPSG:4326')
        scale = max(info.RasterXSize, info.RasterYSize) / MAX_PIXELS
        if scale > 1:
            opts.update(width=round(info.RasterXSize / scale), height=round(info.RasterYSize / scale))
    return gdal.Warp(str(dst), src, **opts)


def read(ds):
    band = ds.GetRasterBand(1)
    data = band.ReadAsArray().astype(np.float32)
    nodata = band.GetNoDataValue()
    if nodata is not None and not np.isnan(nodata):
        data[data == nodata] = np.nan
    data[data < -1000] = np.nan  # ODM's -9999 fill
    return data


def write_png(rgba, path):
    h, w, _ = rgba.shape
    mem = gdal.GetDriverByName('MEM').Create('', w, h, 4, gdal.GDT_Byte)
    for b in range(4):
        mem.GetRasterBand(b + 1).WriteArray(rgba[..., b])
    gdal.GetDriverByName('PNG').CreateCopy(str(path), mem, options=['ZLEVEL=9'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dsm', required=True)
    ap.add_argument('--dtm', required=True)
    ap.add_argument('--ramps', required=True, help='viewer/src/config/heightRamps.json')
    ap.add_argument('--out', required=True, help='survey data directory in viewer/public/data')
    ap.add_argument('--url-prefix', required=True, help='URL of --out as the viewer serves it')
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    ramps = json.loads(Path(args.ramps).read_text())

    dsm_ds = warp_to_4326(args.dsm, out / '_dsm_4326.tif')
    dtm_ds = warp_to_4326(args.dtm, out / '_dtm_4326.tif', like=dsm_ds)
    dsm, dtm = read(dsm_ds), read(dtm_ds)
    canopy = np.where(np.isnan(dsm) | np.isnan(dtm), np.nan, np.maximum(dsm - dtm, 0))

    gt = dsm_ds.GetGeoTransform()
    bounds = dict(west=gt[0], north=gt[3], east=gt[0] + gt[1] * dsm_ds.RasterXSize,
                  south=gt[3] + gt[5] * dsm_ds.RasterYSize)

    layers = {}
    # Shared elevation range so Surface and Ground read on the same scale.
    lo, hi = np.nanpercentile(np.concatenate([dsm[~np.isnan(dsm)], dtm[~np.isnan(dtm)]]), [2, 98])
    for key, data in (('dsm', dsm), ('dtm', dtm)):
        write_png(ramp_rgba(data, lo, hi, ramps['elevation']), out / f'{key}.png')
        layers[key] = dict(url=f'{args.url_prefix}/{key}.png', min=round(float(lo), 2), max=round(float(hi), 2))
    c_hi = float(np.nanpercentile(canopy, 99))
    write_png(ramp_rgba(canopy, 0, c_hi, ramps['canopy']), out / 'canopy.png')
    layers['canopy'] = dict(url=f'{args.url_prefix}/canopy.png', min=0, max=round(c_hi, 2))

    for tmp in ('_dsm_4326.tif', '_dtm_4326.tif'):
        (out / tmp).unlink(missing_ok=True)
    (out / 'heights.json').write_text(json.dumps(dict(bounds=bounds, **layers), indent=2))
    print(json.dumps(dict(bounds=bounds, **layers), indent=2))


if __name__ == '__main__':
    main()
