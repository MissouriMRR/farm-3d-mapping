# Farm 3D Mapping

A React and CesiumJS viewer for the Callis Road drone survey. It displays an
orthophoto over world terrain, camera positions and their flight path, and the
survey boundary.

## Run locally

Use Node.js 22.18 or newer. From the repository root:

```sh
cd viewer
npm ci
npm run dev
```

Open the URL printed by Vite. To use your own Cesium ion access token, create
`viewer/.env.local`:

```dotenv
VITE_CESIUM_ION_TOKEN=your_token_here
```

The token is used in the browser. Without it, Cesium uses its default token and
may display a warning. World terrain and base imagery require network access.

## Development checks

Run these commands from `viewer/`:

```sh
npm run lint
npm test
npm run build
```

The build includes strict TypeScript checking. Tests validate flight-shot data
and ordering, including the checked-in survey. Preview a production build with
`npm run preview`.

## Code layout

- `viewer/src/components/CesiumViewer.tsx`: screen markup and control bindings.
- `viewer/src/components/CesiumViewer.css`: panel layout and theme tokens.
- `viewer/src/hooks/useFieldMap.ts`: React state and the map's mounted lifetime.
- `viewer/src/map/createFieldMap.ts`: Cesium setup, layers, and resource cleanup.
- `viewer/src/map/camera.ts`: orbit gestures and field camera presets.
- `viewer/src/map/flightShots.ts`: validation and chronological ordering of shots.
- `viewer/src/hooks/useTheme.ts`: theme preference and browser storage.
- `viewer/src/config/callisRoad.ts`: survey metadata, bounds, and asset URLs.
- `viewer/src/config/surveys.ts`: picks the generated 3D survey when its files exist.
- `viewer/src/map/datum.ts`: ellipsoidal-to-NAVD88 conversion and height labels.
- `viewer/src/components/HeightPanel.tsx`: height map control and point height readout.
- `pipeline/`: photos to mesh, height maps, and splat; see its README.
- `viewer/public/data/callis-road/`: survey data; the viewer loads the WebP orthophoto.
- `3dmapping/`: requirements and the implementation proposal.
- `DESIGN.md` and `.impeccable/design.json`: the existing visual design and component previews.

Start with the screen component for UI changes and `createFieldMap` for map
behavior. Cesium objects stay inside the map modules. Layer settings are applied
both when controls change and when an asynchronous layer finishes loading.

## Controls

The side panel contains layer toggles, orthophoto opacity, base-map selection,
3D and top-down camera presets, theme selection, survey details, and attribution.
On narrow screens, the panel sits below the map.

- Drag to orbit; right-drag or Shift-drag to pan.
- Two-finger trackpad scroll pans, pinch zooms, and a mouse wheel zooms.
- Trackpad detection uses browser wheel-event heuristics; behavior can vary by device.
- Selecting either view preset returns the camera to the field.

Top-down is a camera preset over the 3D globe.

## 3D survey layers

When a full reconstruction has been exported to `viewer/public/data/callis-road-2026-08-30/`,
the viewer opens it instead of the checked-in orthophoto survey and adds:

- **3D Mesh**: ODM's textured mesh as 3D Tiles. World terrain is cut out under the field so
  the two don't fight.
- **Gaussian Splat**: a photoreal splat trained from the same photos (OpenSplat). It is
  visual only; heights are always read from the mesh.
- **Height Map**: surface (DSM), ground (DTM), or canopy height (DSM minus DTM), with a legend.
- **Point Height**: click anywhere to read the height there, with its datum and source.

These files are large and gitignored. [pipeline/README.md](pipeline/README.md) regenerates them
from the drone photos. Without them, the viewer shows the orthophoto survey and marks the 3D
layers as unavailable.

### Heights and accuracy

Every layer is stored in WGS84 ellipsoidal heights, the frame ODM, Cesium World Terrain, and
Cesium positions share, so the layers line up without offsets. Heights shown to people are
converted to NAVD88 (at Callis Road, NAVD88 = ellipsoidal + 33.8 m). Nothing is labelled "MSL".

Heights within the field are accurate to roughly 5–10 cm relative to each other, which is
good for crop and tree heights, volumes, and distances. The flights had no ground control
points or RTK, so the whole model can sit a few metres off its true position and elevation;
GCPs or an RTK drone would fix that. The photos are nadir only, so trees and other vertical
surfaces look best from above; an oblique orbit on the next flight would improve them.
