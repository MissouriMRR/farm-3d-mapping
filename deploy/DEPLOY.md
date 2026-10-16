# Deploying the Callis Road 3D demo

Context for whoever deploys this (Janet): Parker wants a private, demo-quality link to send his
supervisor. It is a static site, the CesiumJS viewer plus about 110 MB of survey data, served by
Caddy from one container. Anyone with the link can view it; nothing else on the host is exposed.

## What it shows

Callis Road (Field 175), from the 2026-08-30 drone flight:

- textured 3D mesh
- Gaussian splat
- surface, ground, and canopy height maps
- click-to-read heights in NAVD88
- four satellite basemaps (USGS NAIP is the default; its colours match the drone imagery)

## 1. Get the code and data

```bash
git clone --branch feat/height-and-splat-layers https://github.com/MissouriMRR/farm-3d-mapping.git
cd farm-3d-mapping
```

The survey data (about 110 MB: mesh, splat, imagery tiles) is not in git. The MissouriMRR repo
has Git LFS disabled, and committing it as plain files would bloat the team repo's history for
good. It is on Parker's Nextcloud (cloud.petalcat.dev) in the `farm-3d-mapping` folder, as 12
parts plus a README; Parker shares the folder. Rejoin, verify, and unpack:

```bash
cat callis-road-2026-08-30.tar.part* > /tmp/callis-road-2026-08-30.tar
echo "4f80d7071e969a6ce49e46b67a5344d985d771e7782afa7c7f2955c31f2b806d  /tmp/callis-road-2026-08-30.tar" | sha256sum -c -
tar -xf /tmp/callis-road-2026-08-30.tar -C viewer/public/data/   # creates callis-road-2026-08-30/
```

## 2. Pick the private link and settings

```bash
cd deploy
cat > .env <<EOF
DEMO_TOKEN=$(openssl rand -hex 12)
DEMO_PORT=8090
EOF
cp config.example.json config.json
```

The demo link is `https://<host>/<DEMO_TOKEN>/`. Only that path is served; every other path,
including `/`, returns 404, and pages send `noindex` so search engines never list it. To revoke
the link, change `DEMO_TOKEN` and restart.

`config.json` holds the **Cesium ion token**, used for world terrain and the Bing basemap.
Create a free account at https://ion.cesium.com and an access token with the default scopes,
then paste it in. Without it the viewer falls back to Cesium's demo token, which works but
prints a warning in the credits and is not meant for shared links. The file is read at page
load, so changing the token needs only a container restart, not a rebuild. Keep `config.json`
and `.env` out of git; both are gitignored.

## 3. Build and run

```bash
docker compose up -d --build
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8090/          # 404 (locked)
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8090/$(grep DEMO_TOKEN .env | cut -d= -f2)/"   # 200
```

The image is about 400 MB (Node build stage discarded; Caddy plus the built site). The build
fails loudly if the survey data wasn't unpacked.

## 4. Route it

Point a hostname at the container's port in Traefik (file provider), for example
`farm.petalcat.dev` → `http://<docker-host>:8090`. Caddy handles compression and caching; it does
not need TLS (`auto_https off`), since Traefik terminates it. No Authentik in front: the token
path is the lock, so the supervisor can open the link on a phone with no account.

## Performance notes

- Survey imagery is pre-cut into map tiles; the mesh (42 MB) and splat (41 MB) are 3D Tiles
  that stream by level of detail. Phones open on the mesh and load the splat only when toggled.
- Caddy sends `Cache-Control: immutable` for `assets/`, `cesium/`, and `data/`, and a service
  worker keeps survey files and basemap tiles on the device, so repeat visits are near-instant.
  Redeploying a new build starts a fresh cache automatically.
- `?debug` on the link exposes the Cesium viewer as `window.fieldViewer` for troubleshooting.

## Updating

Pull the branch (`git pull`), replace the survey data if a new archive was published, then
`docker compose up -d --build`. The pipeline that regenerates the survey data from drone
photos is in `pipeline/README.md`; it needs a CUDA GPU (Parker's PC), not this host.
