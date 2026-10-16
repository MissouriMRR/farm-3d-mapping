"""Sample a survey's bare-ground height at open-ground points, for registering it to a basemap.

Writes JSON points {lon, lat, h} (WGS84 ellipsoidal metres) on a grid where the surface and
ground models agree to within --max-canopy metres, i.e. bare soil, low crops, or roads.
Runs in the GDAL container.

Usage: python ground_samples.py dsm.tif dtm.tif out.json [--step 6] [--max-canopy 0.3]
"""
import argparse
import json

import numpy as np
from osgeo import gdal, osr

gdal.UseExceptions()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dsm')
    ap.add_argument('dtm')
    ap.add_argument('out')
    ap.add_argument('--step', type=float, default=6, help='grid spacing in metres')
    ap.add_argument('--max-canopy', type=float, default=0.3)
    ap.add_argument('--edge', type=float, default=10, help='metres to stay inside the data edge')
    args = ap.parse_args()

    dsm_ds, dtm_ds = gdal.Open(args.dsm), gdal.Open(args.dtm)
    gt = dtm_ds.GetGeoTransform()
    step = max(1, int(round(args.step / gt[1])))
    edge = max(1, int(round(args.edge / gt[1])))
    dtm = dtm_ds.GetRasterBand(1).ReadAsArray()[::step, ::step].astype(np.float32)
    dsm = dsm_ds.GetRasterBand(1).ReadAsArray()[::step, ::step].astype(np.float32)
    for a in (dtm, dsm):
        a[a < -1000] = np.nan
    valid = ~np.isnan(dtm) & ~np.isnan(dsm)
    # Stay away from the ragged data edge, where interpolation is weakest.
    inner = valid.copy()
    k = max(1, edge // step)
    for axis in (0, 1):
        for shift in (-k, k):
            inner &= np.roll(valid, shift, axis=axis)
    open_ground = inner & (np.abs(dsm - dtm) <= args.max_canopy)

    rows, cols = np.nonzero(open_ground)
    x = gt[0] + (cols * step + 0.5) * gt[1]
    y = gt[3] + (rows * step + 0.5) * gt[5]
    srs = osr.SpatialReference(wkt=dtm_ds.GetProjection())
    wgs84 = osr.SpatialReference()
    wgs84.ImportFromEPSG(4326)
    for s in (srs, wgs84):
        s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    lonlat = np.array(osr.CoordinateTransformation(srs, wgs84).TransformPoints(np.column_stack([x, y])))
    points = [dict(lon=round(float(lo), 8), lat=round(float(la), 8), h=round(float(h), 3))
              for (lo, la, _), h in zip(lonlat, dtm[rows, cols])]
    json.dump(points, open(args.out, 'w'))
    print(f'{len(points)} open-ground points')


if __name__ == '__main__':
    main()
