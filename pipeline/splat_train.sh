#!/bin/bash
# Train a Gaussian splat from a NodeODM task's alignment (waits for it if ODM is still running).
# Usage: pipeline/splat_train.sh <task-uuid> <survey-id>
# Needs the opensplat:cu121-sm86 image (see README) and a CUDA GPU visible to Docker.
set -euo pipefail
T=${1:?task uuid}
SURVEY=${2:?survey id}
TASK=/var/lib/docker/volumes/farm-mapping_task-data/_data/$T
OUT=${SPLAT_WORK:-/opt/farm-mapping/splat}/$SURVEY
mkdir -p "$OUT"
until docker image inspect opensplat:cu121-sm86 >/dev/null 2>&1; do sleep 20; done
echo "waiting for alignment in $TASK"
until [ -f "$TASK/opensfm/reconstruction.topocentric.json" ] && [ -f "$TASK/opensfm/reference_lla.json" ]; do sleep 30; done
sleep 20  # let ODM finish writing

# Stage a copy on ext4 so ODM can keep working on its own files.
STAGE=$OUT/project
mkdir -p "$STAGE/splat_topo"
ln -sfn "$TASK/images" "$STAGE/images"
cp "$TASK/opensfm/reconstruction.topocentric.json" "$STAGE/splat_topo/reconstruction.json"
cp "$TASK/opensfm/reference_lla.json" "$STAGE/reference_lla.json"
sed -E 's#^.*/##; s#^#../images/#' "$TASK/opensfm/image_list.txt" > "$STAGE/splat_topo/image_list.txt"
# The images symlink must resolve inside the container too.
RUN="docker run --rm --gpus all --shm-size 8g -v $TASK/images:/data/images:ro -v $STAGE/splat_topo:/data/splat_topo -v $OUT:/data/out opensplat:cu121-sm86 /code/build/opensplat /data/splat_topo"

echo "smoke test $(date)"
$RUN -d 8 -n 300 -o /data/out/smoke.ply 2>&1 | tail -5

echo "full run $(date)"
$RUN -d 2 -n 30000 --max-gaussians 1600000 --sh-degree 3 --save-every 5000 --val \
  -o /data/out/callis_topo.ply 2>&1 | grep --line-buffered -vE '^\s*$' | awk 'NR%250==1 || /rror|nan|Saved|out of memory/'
echo "SPLAT_DONE $(date)"
ls -la "$OUT"
