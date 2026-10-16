#!/bin/bash
# Tile ODM's single-material textured mesh into 3D Tiles with a browser-sized texture atlas.
#
# With texturing-single-material, ODM bakes one atlas for the whole field (36k x 40k px for
# Callis Road), which Obj2Tiles silently fails to tile. The atlas UVs are normalized, so this
# downsamples it (default 16384 px wide, ~2.5 cm/px over the field) and runs Obj2Tiles with
# ODM's own arguments on the result.
#
# Usage: pipeline/tile_mesh.sh <task-dir> <out-dir> [atlas-width]
set -euo pipefail
TASK=$(realpath "$1")
OUT=$2
WIDTH=${3:-16384}
NODEODM_IMAGE=${NODEODM_IMAGE:-opendronemap/nodeodm:gpu}
GDAL_IMAGE=${GDAL_IMAGE:-ghcr.io/osgeo/gdal:ubuntu-full-3.10.3}
WORK=$(mktemp -d /tmp/tile-mesh.XXXX)
trap 'rm -rf "$WORK"' EXIT
# The NodeODM image runs as an unprivileged user; let it read inputs and write tiles.
chmod 777 "$WORK"

TEX=$TASK/odm_texturing
cp "$TEX/odm_textured_model_geo.obj" "$WORK/model.obj"
sed -i 's/odm_textured_model_geo\.mtl/model.mtl/' "$WORK/model.obj"
ATLAS=$(ls "$TEX"/odm_textured_model_geo_material0000_map_Kd.* | head -1)

echo "atlas: $(basename "$ATLAS") -> ${WIDTH}px wide JPEG"
docker run --rm -v "$TEX:/tex:ro" -v "$WORK:/w" "$GDAL_IMAGE" \
  gdal_translate -q -of JPEG -co QUALITY=92 -r bilinear -outsize "$WIDTH" 0 "/tex/$(basename "$ATLAS")" /w/atlas.jpg
rm -f "$WORK/atlas.jpg.aux.xml"
sed -E 's#^(\s*map_Kd\s+).*#\1atlas.jpg#' "$TEX/odm_textured_model_geo.mtl" > "$WORK/model.mtl"

read -r LAT LON < <(python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(d["latitude"],d["longitude"])' "$TASK/opensfm/reference_lla.json")
echo "tiling at $LAT, $LON"
docker run --rm -v "$WORK:/w" --entrypoint /code/SuperBuild/install/bin/Obj2Tiles "$NODEODM_IMAGE" \
  /w/model.obj /w/tiles --divisions 2 --lat "$LAT" --lon "$LON" --alt 0.0

rm -rf "$OUT"
mkdir -p "$OUT"
cp -r "$WORK/tiles/." "$OUT/"
rm -rf "$OUT/.temp"
du -sh "$OUT"
