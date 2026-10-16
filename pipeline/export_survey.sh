#!/bin/bash
# Export a finished NodeODM task into the viewer's (gitignored) survey data folder.
#
# Usage: pipeline/export_survey.sh <task-dir> <survey-id>
#   <task-dir>   the task folder with odm_* outputs (NodeODM's task volume, or an unzipped all.zip)
#   <survey-id>  folder name under viewer/public/data, e.g. callis-road-2026-08-30
set -euo pipefail
TASK=$(realpath "$1")
SURVEY=$2
REPO=$(cd "$(dirname "$0")/.." && pwd)
OUT=$REPO/viewer/public/data/$SURVEY
GDAL_IMAGE=${GDAL_IMAGE:-ghcr.io/osgeo/gdal:ubuntu-full-3.10.3}
mkdir -p "$OUT"

echo "mesh: single-atlas 3D Tiles, fixed and optimized for browsers"
TILES=$(mktemp -d /tmp/mesh-tiles.XXXX)
bash "$REPO/pipeline/tile_mesh.sh" "$TASK" "$TILES/raw"

echo "orthophoto, shots, boundary, report"
cp "$TASK/odm_report/shots.geojson" "$OUT/shots.geojson"
cp "$TASK/odm_report/stats.json" "$OUT/stats.json" 2>/dev/null || true
rm -f "$OUT/bounds.geojson"

docker run --rm -v "$TASK:/task:ro" -v "$OUT:/out" -v "$REPO:/repo:ro" "$GDAL_IMAGE" bash -c '
  set -e
  # ODM writes the boundary in its UTM working CRS; the viewer (and GeoJSON) need WGS84 lon/lat.
  ogr2ogr -f GeoJSON -t_srs EPSG:4326 -lco COORDINATE_PRECISION=8 /out/bounds.geojson \
    /task/odm_georeferencing/odm_georeferenced_model.bounds.gpkg
  # Orthophoto as one WebP overlay (4096 px max side), the same way the viewer loads the existing one.
  gdalwarp -q -overwrite -t_srs EPSG:4326 -ts 4096 0 -r lanczos -dstalpha /task/odm_orthophoto/odm_orthophoto.tif /tmp/ortho.tif
  gdal_translate -q -of WEBP -co QUALITY=90 -b 1 -b 2 -b 3 -b 4 /tmp/ortho.tif /out/orthophoto.webp
  gdalinfo -json /tmp/ortho.tif > /out/orthophoto.info.json
  python3 /repo/pipeline/render_heights.py --dsm /task/odm_dem/dsm.tif --dtm /task/odm_dem/dtm.tif \
    --ramps /repo/viewer/src/config/heightRamps.json --out /out --url-prefix "'"/data/$SURVEY"'"
'
rm -f "$OUT/orthophoto.webp.aux.xml"

# Needs Node.js and `npm install` in pipeline/; see the scripts for why each step exists.
node "$REPO/pipeline/fix_tileset_bounds.mjs" "$TILES/raw"
rm -rf "$OUT/mesh"
node "$REPO/pipeline/optimize_mesh.mjs" "$TILES/raw" "$OUT/mesh"
rm -rf "$TILES"
echo "exported to $OUT"
du -sh "$OUT"
