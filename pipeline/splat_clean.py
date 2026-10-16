"""Crop a trained OpenSplat PLY to the field and drop floaters, ready for tiling.

OpenSplat trained on ODM's topocentric reconstruction writes positions in local ENU metres
around opensfm/reference_lla.json (altitude 0 on the WGS84 ellipsoid). This keeps that frame,
so one ENU->ECEF transform at the reference point places the splat on the globe.

Keeps Gaussians that are inside the field polygon (plus a margin), not near-transparent, and
not oversized. With --dsm/--dtm (ODM's elevation models, any CRS GDAL reads) it also clips the
splat to the measured surface: anything more than --above m over the DSM (sky floaters) or
--below m under the DTM is dropped, so the splat hugs the mesh. Without them it falls back to
a coarse height band around the ground. Writes a binary PLY with a `z-up` comment,
which 3dgs-ply-3dtiles-converter reads as ENU.

Usage: python splat_clean.py in.ply reference_lla.json boundary.geojson out.ply
       [--dsm dsm.tif --dtm dtm.tif] [--margin 15]
The --dsm/--dtm path needs GDAL's Python bindings (run it in the GDAL container).
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


def from_enu(x, y, lon0, lat0):
    lon = lon0 + np.degrees(x / (EARTH_RADIUS * math.cos(math.radians(lat0))))
    lat = lat0 + np.degrees(y / EARTH_RADIUS)
    return lon, lat


def sample_raster(path, lon, lat):
    """Nearest-pixel values of a single-band raster at WGS84 lon/lat; NaN outside or on nodata."""
    from osgeo import gdal, osr
    ds = gdal.Open(path)
    srs = osr.SpatialReference(wkt=ds.GetProjection())
    wgs84 = osr.SpatialReference()
    wgs84.ImportFromEPSG(4326)
    wgs84.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    pts = np.array(osr.CoordinateTransformation(wgs84, srs).TransformPoints(np.column_stack([lon, lat])))
    gt = ds.GetGeoTransform()
    col = np.floor((pts[:, 0] - gt[0]) / gt[1]).astype(int)
    row = np.floor((pts[:, 1] - gt[3]) / gt[5]).astype(int)
    band = ds.GetRasterBand(1)
    data = band.ReadAsArray().astype(np.float32)
    nodata = band.GetNoDataValue()
    if nodata is not None:
        data[data == nodata] = np.nan
    data[data < -1000] = np.nan
    ok = (col >= 0) & (row >= 0) & (col < ds.RasterXSize) & (row < ds.RasterYSize)
    out = np.full(len(lon), np.nan, dtype=np.float32)
    out[ok] = data[row[ok], col[ok]]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ply')
    ap.add_argument('reference_lla')
    ap.add_argument('boundary')
    ap.add_argument('out')
    ap.add_argument('--margin', type=float, default=15)
    ap.add_argument('--min-opacity', type=float, default=0.1)
    ap.add_argument('--max-scale', type=float, default=2.5, help='drop Gaussians wider than this many metres')
    ap.add_argument('--max-aspect', type=float, default=15,
                    help='drop needle-like Gaussians whose longest axis exceeds this many times the middle one (and 0.3 m)')
    ap.add_argument('--dsm')
    ap.add_argument('--dtm')
    ap.add_argument('--above', type=float, default=0.75, help='metres allowed above the DSM')
    ap.add_argument('--below', type=float, default=1.0, help='metres allowed below the DTM')
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

    axes = np.exp(data[:, [col['scale_0'], col['scale_1'], col['scale_2']]])
    axes.sort(axis=1)
    longest, middle = axes[:, 2], np.maximum(axes[:, 1], 1e-6)
    # Nadir-only photos never see the sides of things, so training invents long thin "needles".
    # Flat discs (thin on one axis) are normal surface splats; a needle is thin on two.
    needles = (longest / middle > args.max_aspect) & (longest > 0.3)

    keep = inside(x, y, poly) & (opacity >= args.min_opacity) & (longest <= args.max_scale) & ~needles
    stats = {'in': len(data), 'after_crop_opacity_scale': int(keep.sum())}
    if args.dsm and args.dtm:
        lon, lat = from_enu(x.astype(np.float64), y.astype(np.float64), lon0, lat0)
        dsm, dtm = sample_raster(args.dsm, lon, lat), sample_raster(args.dtm, lon, lat)
        known = ~np.isnan(dsm) & ~np.isnan(dtm)
        # Outside the elevation models' coverage there is nothing to check against; drop it.
        keep &= known & (z <= dsm + args.above) & (z >= dtm - args.below)
        stats['after_surface_clip'] = int(keep.sum())
    else:
        # Coarse fallback: from just below the ground to treetop height, judged on the kept points.
        ground = np.percentile(z[keep], 2)
        keep &= (z > ground - 3) & (z < ground + 45)

    write_ply(args.out, props, data[keep])
    stats.update(out=int(keep.sum()), reference={'latitude': lat0, 'longitude': lon0, 'altitude': ref.get('altitude', 0)})
    print(json.dumps(stats))


if __name__ == '__main__':
    main()
