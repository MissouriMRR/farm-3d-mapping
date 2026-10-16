# Builds the viewer (including the survey data unpacked into viewer/public/data; see
# DEPLOY.md) and serves it with Caddy. Build from the repository root:
#   docker build -f deploy/Dockerfile -t farm-3d-demo .
FROM node:22.18-bookworm-slim AS build
WORKDIR /app/viewer
COPY viewer/package.json viewer/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY viewer/ ./
# Fail loudly if the survey data was not unpacked; without it the demo shows only a flat photo.
RUN test -f public/data/callis-road-2026-08-30/mesh/tileset.json \
  || (echo "Survey data missing: unpack it into viewer/public/data (deploy/DEPLOY.md, step 1)." && exit 1)
RUN npm run build

FROM caddy:2.10.2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/viewer/dist /srv/site
