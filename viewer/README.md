# Farm 3D Mapping - Web Viewer

CesiumJS + React + TypeScript frontend viewer for drone orthophotos, flight paths, and 3D terrain meshes.

## Quick Start

### Install Dependencies
```bash
npm install
```

### Run Dev Server
```bash
npm run dev
```
Open http://localhost:5173 to access the Cesium globe viewer.

### Production Build
```bash
npm run build
```

## Architecture
- **Framework:** React 19 + TypeScript
- **Bundler:** Vite with `vite-plugin-cesium`
- **GIS Engine:** CesiumJS
- **Main Viewer Component:** `src/components/CesiumViewer.tsx`

