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

Top-down is a camera preset over the 3D globe. The current viewer does not load
a reconstructed 3D farm mesh.
