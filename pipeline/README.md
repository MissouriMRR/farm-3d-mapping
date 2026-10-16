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
| Mesh tiling (single-material atlas) | `tile_mesh.sh` | NodeODM image (Obj2Tiles) + GDAL |
| Mesh tileset fix, texture optimization | `fix_tileset_bounds.mjs`, `optimize_mesh.mjs` | Node.js (`npm install` in `pipeline/`) |
| Splat crop and cleanup | `splat_clean.py` | GDAL container (NumPy + GDAL Python) |
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

The mesh needs three extra steps before a browser can show it:

1. `tile_mesh.sh <task-dir> <tiles-dir>`: with `texturing-single-material`, ODM bakes one
   atlas for the whole field (36k x 40k px at Callis Road) that its own tiler silently fails on.
   This downsamples the atlas to 16384 px and runs Obj2Tiles with ODM's arguments.
2. `node fix_tileset_bounds.mjs <tiles-dir>`: Obj2Tiles writes z-up vertices but y-up bounding
   boxes and no `gltfUpAxis`, so Cesium buries and culls every tile. This declares z-up and
   remaps the boxes (the original stays as `tileset.odm.json`).
3. `node optimize_mesh.mjs <tiles-dir> viewer/public/data/<survey>/mesh`: Obj2Tiles repacks
   coarse tiles into 32768 px atlases (over 4 GB decoded). This caps textures at 512 / 1024 /
   2048 px for the coarse / middle / fine levels and encodes WebP: 282 MB down to 79 MB, and the
   mesh loads in about 3 seconds.

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

The cleanup clips the splat to the measured surface: Gaussians more than 0.75 m above the DSM
(floaters in the sky) or 1 m below the DTM are dropped, along with near-transparent ones,
blobs wider than 2.5 m, and "needles" (long on one axis, thin on the other two) that nadir-only
photos produce. At Callis Road that kept 915k of 1.5M Gaussians and removed every visible
floater.

Check the result: `build_summary.json` must report a z-up source frame, and a road edge in the
splat should sit on the mesh with no float or sink.

## 5. Register to the basemap, and tile the imagery

Without ground control the survey sits a few metres off: at Callis Road it was 3.5 m too high,
tilted about 1.2 degrees (east side high), and 4.2 m east of the satellite road. The viewer
corrects this from `alignment.json` in the survey folder (see `SurveyAlignment` in
`viewer/src/config/callisRoad.ts`), applying one transform to the mesh, splat, and flight path.

- **Vertical:** `ground_samples.py` samples the DTM at open-ground points (DSM within 0.3 m of
  DTM). Fit a plane to Cesium World Terrain minus those heights (`sampleTerrainMostDetailed` in
  the viewer with `?debug`). `up`, `slopeEast`, and `slopeNorth` are the plane's coefficients.
- **Horizontal:** measure a sharp feature (a road edge) against the satellite basemap, top-down,
  with the orthophoto on and off. Automatic image correlation against Esri imagery was tried
  and was not reliable over grass.

Inside the field, world terrain is cut out 25 m in from the boundary so it can't poke through
the survey; at the edges the orthophoto-draped terrain fills in underneath.

`tile_imagery.sh` then cuts the orthophoto and height maps into XYZ tile pyramids, with the
horizontal shift baked in (`export_survey.sh` runs it; it reads `alignment.json`, so write that
first and re-run the tiling if it changes). Single large overlays made Cesium freeze for up to a
second while panning.

## Basemaps

The viewer offers USGS (NAIP), Bing, Esri, and a road map. Mean colour over the Callis field
matched the drone imagery best for USGS (summer, leaf-on aerial photography), so it is the
default; Bing and Esri carry brightness and saturation corrections (`BASE_MAP_GRADE`).
