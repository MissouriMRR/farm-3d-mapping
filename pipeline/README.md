# Survey pipeline

Turns a folder of geotagged drone photos into everything the viewer shows for a survey: a
textured 3D mesh, surface and ground elevation, canopy height, an orthophoto, and a Gaussian
splat. Outputs land in `viewer/public/data/<survey-id>/`, which git ignores; rerun the pipeline
to regenerate them.

## What runs where

| Step | Script | Runs in |
|---|---|---|
| Reconstruction (alignment, mesh, DSM, DTM, orthophoto) | `odm_submit.py` | NodeODM (`opendronemap/nodeodm:gpu`) |
| Viewer export, height ramps | `export_survey.sh` → `render_heights.py` | GDAL container |
| Splat training | `splat_train.sh` | OpenSplat container (CUDA) |
| Splat crop and cleanup | `splat_clean.py` | Python 3 + NumPy |
| Splat tiling | `npx 3dgs-ply-3dtiles-converter` | Node.js 18+ |

Everything was built and run on Windows 11 with WSL2 Ubuntu 24.04, Docker, and an RTX 3080.

## Heights and frames

ODM, Cesium World Terrain, and Cesium positions all use **WGS84 ellipsoidal** heights, so the
mesh, the overlays, and the splat need no vertical offset to line up. The viewer converts to
NAVD88 only when it shows a height to a person (`viewer/src/map/datum.ts`); at Callis Road
NAVD88 = ellipsoidal + 33.8 m. Never label a height "MSL".

The splat trains in OpenSfM's local ENU frame around `opensfm/reference_lla.json` (altitude 0),
so the tileset root is a single ENU-to-ECEF transform at that point.

## 1. Machine setup (once)

NodeODM needs far more than Docker's defaults to finish a full-quality run; a 10 GB container
was OOM-killed in depth-map fusion on 192 photos. On a 32 GB host:

```ini
# %UserProfile%\.wslconfig  (then: wsl --shutdown)
[wsl2]
memory=26GB
swap=32GB
processors=16
vmIdleTimeout=-1
```

```yaml
# NodeODM compose service
gpus: all
cpus: 16
mem_limit: 25g
memswap_limit: 56g
shm_size: 4g
command: [--port, "3000", --parallel_queue_processing, "1", --max_concurrency, "16"]
```

NodeODM forgets failed tasks when its container is recreated and deletes their folders as
orphans: copy anything you need out of the task volume first.

Build OpenSplat for the RTX 3080 (compute capability 8.6):

```bash
git clone https://github.com/pierotofy/OpenSplat && cd OpenSplat && git checkout v1.2.2
docker build -t opensplat:cu121-sm86 --build-arg UBUNTU_VERSION=22.04 --build-arg CUDA_VERSION=12.1.1 \
  --build-arg TORCH_VERSION=2.2.1 --build-arg CMAKE_CUDA_ARCHITECTURES=86 --build-arg CMAKE_BUILD_TYPE=Release .
```

## 2. Reconstruct

```bash
python pipeline/odm_submit.py /path/to/photos --name "Callis Road 2026-08-30"
```

The options (`feature-quality: ultra`, `pc-quality: high`, 2 cm DEMs, full-resolution
orthophoto, denser mesh) favour quality; 192 photos took about 2–3 hours on the machine above.
`optimize-disk-space` stays off because the splat trainer needs `opensfm/` and the images.
`texturing-single-material` bakes one texture atlas per mesh tile; without it each tile held
around 100 separate textures (up to 86 MB per tile) and browsers ran out of GPU memory.

Run the full reconstruction and the splat **one after the other on the GPU**, or start the
splat once ODM reaches `odm_filterpoints` (after OpenMVS's depth maps). Both on a 10 GB card
at once pushes the splat into system memory, where it trains about 100 times slower.

## 3. Export for the viewer

```bash
pipeline/export_survey.sh /var/lib/docker/volumes/farm-mapping_task-data/_data/<task-uuid> callis-road-2026-08-30
```

ODM 3.6.2's tiler writes each mesh tile's bounding box with the vertical axis on y; Cesium
reads boxes as z-up, decides the mesh is underground, and draws nothing. The export runs
`fix_tileset_bounds.mjs` to remap them (the original stays as `mesh/tileset.odm.json`).

Writes `mesh/` (3D Tiles), `orthophoto.webp`, `dsm.png`, `dtm.png`, `canopy.png`,
`heights.json` (bounds and ramp ranges), `shots.geojson`, and `bounds.geojson`. The ramp colours
come from `viewer/src/config/heightRamps.json`, which the panel legend also reads.

## 4. Splat

```bash
pipeline/splat_train.sh <task-uuid> callis-road-2026-08-30      # smoke test, then the full run
python pipeline/splat_clean.py <work>/callis_topo.ply <work>/project/reference_lla.json \
  viewer/public/data/callis-road-2026-08-30/bounds.geojson <work>/callis_clean.ply
npx 3dgs-ply-3dtiles-converter --coordinate '[<ref_lat>, <ref_lon>, 0]' --no-open-inspector \
  <work>/callis_clean.ply viewer/public/data/callis-road-2026-08-30/splat
```

Training settings for a 10 GB card: half-resolution images (`-d 2`), spherical-harmonic
degree 3, 30 000 iterations, and **at most 1.6 M Gaussians**. Above about 1.7 M the card
spills into system memory and training slows from ~25 to ~0.2 steps per second; if that
happens, stop and `--resume` from the last `*_5000.ply`-style checkpoint with a lower cap.
The Callis run took about 30 minutes with the GPU to itself and finished at 1.5 M Gaussians. Nadir-only photos give a top-down-quality splat; vertical surfaces need an
oblique pass on the next flight.

Check the result: `build_summary.json` must report a z-up source frame, and a road edge in the
splat should sit on the mesh with no float or sink.
