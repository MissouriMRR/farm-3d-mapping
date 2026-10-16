#!/bin/bash
# Cut the orthophoto and height overlays into Web Mercator XYZ tile pyramids (WebP).
#
# A single 4096 px overlay makes Cesium re-project the whole image for every terrain tile it
# draws, which freezes panning and zooming for up to a second at a time; small pre-cut tiles
# stream like the basemap. The survey's horizontal alignment (alignment.json: east/north metres)
# is baked into the tiles, since fixed tile grids cannot be shifted at runtime.
#
# Usage: pipeline/tile_imagery.sh <task-dir> <survey-data-dir>
#   needs <survey-data-dir>/heights/{dsm,dtm,canopy}.tif (render_heights.py --geotiff) and,
#   optionally, <survey-data-dir>/alignment.json.
set -euo pipefail
TASK=$(realpath "$1")
OUT=$(realpath "$2")
GDAL_IMAGE=${GDAL_IMAGE:-ghcr.io/osgeo/gdal:ubuntu-full-3.10.3}

docker run --rm -v "$TASK:/task:ro" -v "$OUT:/out" "$GDAL_IMAGE" bash -c '
set -euo pipefail
python3 - <<"PY"
import json, math, os
from osgeo import gdal
gdal.UseExceptions()
a = {"east": 0, "north": 0}
if os.path.exists("/out/alignment.json"):
    a.update(json.load(open("/out/alignment.json")))

def shifted_vrt(src, dst, degrees):
    ds = gdal.Translate(dst, src, format="VRT")
    gt = list(ds.GetGeoTransform())
    if degrees:  # WGS84 rasters: metres -> degrees at the raster centre
        lat = gt[3] + gt[5] * ds.RasterYSize / 2
        gt[0] += math.degrees(a["east"] / (6378137 * math.cos(math.radians(lat))))
        gt[3] += math.degrees(a["north"] / 6378137)
    else:        # projected (UTM) rasters are already in metres
        gt[0] += a["east"]
        gt[3] += a["north"]
    ds.SetGeoTransform(gt)
    ds = None

shifted_vrt("/task/odm_orthophoto/odm_orthophoto.tif", "/tmp/ortho.vrt", degrees=False)
for key in ("dsm", "dtm", "canopy"):
    shifted_vrt(f"/out/heights/{key}.tif", f"/tmp/{key}.vrt", degrees=True)
print("alignment baked:", a["east"], "m east,", a["north"], "m north")
PY
tile() { rm -rf "/out/$2"; gdal2tiles --xyz -z "$3" -w none -r average --processes=12 \
  --tiledriver=WEBP --webp-quality=82 -q "$1" "/out/$2"; }
tile /tmp/ortho.vrt ortho 14-21
for key in dsm dtm canopy; do tile "/tmp/$key.vrt" "tiles-$key" 14-19; done
'
du -sh "$OUT"/ortho "$OUT"/tiles-*
find "$OUT/ortho" -name "*.webp" | wc -l

# The GeoTIFF inputs were only needed for tiling; keep them out of the served site.
rm -rf "$OUT/heights"
