# Builds the viewer (including the Git LFS survey data in viewer/public/data) and serves it
# with Caddy. Build from the repository root after `git lfs pull`:
#   docker build -f deploy/Dockerfile -t farm-3d-demo .
FROM node:22.18-bookworm-slim AS build
WORKDIR /app/viewer
COPY viewer/package.json viewer/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY viewer/ ./
# Fail loudly if the LFS data was not pulled (pointer files are ~130 bytes of text).
RUN test "$(head -c 7 public/data/callis-road-2026-08-30/mesh/tileset.json)" != "version" \
  || (echo "Survey data is a Git LFS pointer; run 'git lfs pull' before building." && exit 1)
RUN npm run build

FROM caddy:2.10.2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/viewer/dist /srv/site
