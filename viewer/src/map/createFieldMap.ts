import * as Cesium from 'cesium'
import type { FieldMetadata, HeightLayerKey } from '../config/callisRoad'
import { flyToField, installOrbitControls, type ViewMode } from './camera'
import { parseFlightShots } from './flightShots'

const BASE_MAP_STYLES = {
  satellite: Cesium.IonWorldImageryStyle.AERIAL,
  hybrid: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS,
  road: Cesium.IonWorldImageryStyle.ROAD,
}

export type HeightLayerChoice = HeightLayerKey | 'none'

export type MapSettings = {
  baseMap: keyof typeof BASE_MAP_STYLES
  orthoVisible: boolean
  opacity: number
  flightPathVisible: boolean
  boundaryVisible: boolean
  meshVisible: boolean
  splatVisible: boolean
  heightLayer: HeightLayerChoice
}

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  baseMap: 'satellite',
  orthoVisible: true,
  opacity: 1,
  flightPathVisible: false,
  boundaryVisible: false,
  meshVisible: true,
  splatVisible: false,
  heightLayer: 'none',
}

/**
 * ODM's boundary is the hull of the whole point cloud, a little wider than the textured mesh.
 * Cutting terrain to the full hull leaves see-through slivers at the edges, so cut slightly inside.
 */
const TERRAIN_CUT_INSET_M = 20

/** Pulls each vertex of a lon/lat ring toward its centroid by `metres`; returns a flat lon/lat array. */
function insetRing(ring: number[][], metres: number): number[] {
  const lon0 = ring.reduce((sum, [lon]) => sum + lon, 0) / ring.length
  const lat0 = ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length
  const metresPerDegLat = 111_320
  const metresPerDegLon = metresPerDegLat * Math.cos(Cesium.Math.toRadians(lat0))
  return ring.flatMap(([lon, lat]) => {
    const dx = (lon - lon0) * metresPerDegLon
    const dy = (lat - lat0) * metresPerDegLat
    const scale = Math.max(0, 1 - metres / (Math.hypot(dx, dy) || 1))
    return [lon0 + (dx * scale) / metresPerDegLon, lat0 + (dy * scale) / metresPerDegLat]
  })
}

/** A height read at a clicked point, always in the WGS84 ellipsoidal frame. */
export type PickedHeight = {
  longitude: number
  latitude: number
  ellipsoidalHeight: number
  source: 'mesh' | 'terrain'
}

type FieldMapOptions = {
  container: HTMLElement
  credits: HTMLElement
  field: FieldMetadata
  onOrthophotoLoaded: () => void
  onHeightPicked: (picked: PickedHeight | null) => void
}

/** Owns Cesium resources and asynchronous layers for one mounted map. */
export function createFieldMap({
  container, credits, field, onOrthophotoLoaded, onHeightPicked,
}: FieldMapOptions) {
  const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN
  if (ionToken) Cesium.Ion.defaultAccessToken = ionToken

  const viewer = new Cesium.Viewer(container, {
    timeline: false,
    animation: false,
    // The React panel owns controls and attribution.
    baseLayerPicker: false,
    baseLayer: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    selectionIndicator: false,
    infoBox: false,
    creditContainer: credits,
    terrain: Cesium.Terrain.fromWorldTerrain({
      requestVertexNormals: false,
      requestWaterMask: false,
    }),
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    msaaSamples: 1,
  })

  // Trade a little tile detail for smoother navigation, and retain visited tiles.
  viewer.scene.globe.maximumScreenSpaceError = 3
  viewer.scene.globe.tileCacheSize = 1000
  viewer.scene.globe.depthTestAgainstTerrain = true
  const removeOrbitControls = installOrbitControls(viewer)
  // Dev-only handle for inspecting layers from the browser console.
  if (import.meta.env.DEV) Object.assign(window, { fieldViewer: viewer })

  let settings = DEFAULT_MAP_SETTINGS
  let baseLayer: Cesium.ImageryLayer | undefined
  let orthophoto: Cesium.ImageryLayer | undefined
  let flightPath: Cesium.Entity | undefined
  let flightPoints: Cesium.PointPrimitiveCollection | undefined
  let boundary: Cesium.GeoJsonDataSource | undefined
  let mesh: Cesium.Cesium3DTileset | undefined
  let splat: Cesium.Cesium3DTileset | undefined
  let terrainCut: Cesium.ClippingPolygonCollection | undefined
  const heightOverlays = new Map<HeightLayerKey, Cesium.ImageryLayer>()
  const pickMarker = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection()) as Cesium.PointPrimitiveCollection
  const requests = new AbortController()

  /** Height maps are 2D products draped on the ground, the same way the orthophoto is. */
  function heightOverlay(key: HeightLayerKey) {
    const raster = field.layers?.heights?.[key]
    const bounds = field.layers?.heights?.bounds
    if (!raster || !bounds) return undefined
    let layer = heightOverlays.get(key)
    if (!layer) {
      const { west, south, east, north } = bounds
      layer = Cesium.ImageryLayer.fromProviderAsync(
        Cesium.SingleTileImageryProvider.fromUrl(raster.url, {
          rectangle: Cesium.Rectangle.fromDegrees(west, south, east, north),
        }),
        {},
      )
      viewer.imageryLayers.add(layer)
      heightOverlays.set(key, layer)
    }
    return layer
  }

  function applyLayerSettings() {
    // A height map lies on the ground, so the mesh (and its terrain cut) steps aside while one is on.
    const meshShown = Boolean(mesh) && settings.meshVisible && settings.heightLayer === 'none'
    if (orthophoto) {
      orthophoto.show = settings.orthoVisible
      orthophoto.alpha = settings.opacity
    }
    if (flightPath) flightPath.show = settings.flightPathVisible
    if (flightPoints) flightPoints.show = settings.flightPathVisible
    if (boundary) boundary.show = settings.boundaryVisible
    if (mesh) mesh.show = meshShown
    // The mesh carries the field's real surface, so world terrain is cut out beneath it.
    if (terrainCut) terrainCut.enabled = meshShown
    if (splat) splat.show = settings.splatVisible

    for (const layer of heightOverlays.values()) layer.show = false
    if (settings.heightLayer !== 'none') {
      const overlay = heightOverlay(settings.heightLayer)
      if (overlay) overlay.show = true
    }

    // Splats re-sort every frame as the camera moves; render-on-demand would leave them stale.
    viewer.scene.requestRenderMode = !(splat && settings.splatVisible)
    viewer.scene.requestRender()
  }

  function setBaseMap() {
    const next = Cesium.ImageryLayer.fromProviderAsync(
      Cesium.createWorldImageryAsync({ style: BASE_MAP_STYLES[settings.baseMap] }),
      {},
    )
    viewer.imageryLayers.add(next, 0)
    if (baseLayer) viewer.imageryLayers.remove(baseLayer, true)
    baseLayer = next
  }

  async function loadOrthophoto() {
    const { west, south, east, north } = field.bounds
    const provider = await Cesium.SingleTileImageryProvider.fromUrl(field.orthophotoUrl, {
      rectangle: Cesium.Rectangle.fromDegrees(west, south, east, north),
    })
    if (viewer.isDestroyed()) return

    orthophoto = viewer.imageryLayers.addImageryProvider(provider)
    applyLayerSettings()
    onOrthophotoLoaded()
  }

  async function loadFlightPath() {
    const response = await fetch(field.shotsUrl, { signal: requests.signal })
    if (!response.ok) throw new Error(`Flight shots request failed (${response.status})`)
    const data: unknown = await response.json()
    if (viewer.isDestroyed()) return

    const positions = parseFlightShots(data).map(({ coordinates }) =>
      Cesium.Cartesian3.fromDegrees(...coordinates),
    )

    flightPath = viewer.entities.add({
      id: 'flight-trajectory',
      polyline: {
        positions,
        width: 2.5,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          color: Cesium.Color.YELLOW,
        }),
      },
    })

    flightPoints = new Cesium.PointPrimitiveCollection()
    viewer.scene.primitives.add(flightPoints)
    const pointColor = Cesium.Color.fromCssColorString('#f59e0b')
    for (const position of positions) {
      flightPoints.add({
        position,
        pixelSize: 4,
        color: pointColor,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
      })
    }
    applyLayerSettings()
  }

  async function loadBoundary() {
    const source = await Cesium.GeoJsonDataSource.load(field.boundsUrl, {
      stroke: Cesium.Color.fromCssColorString('#10b981'),
      strokeWidth: 3,
      fill: Cesium.Color.fromCssColorString('#10b981').withAlpha(0.12),
      clampToGround: true,
    })
    if (viewer.isDestroyed()) return

    await viewer.dataSources.add(source)
    if (viewer.isDestroyed()) return
    boundary = source
    applyLayerSettings()
  }

  /** Cuts world terrain (and the imagery draped on it) inside the field boundary. */
  async function cutTerrainUnderField() {
    const response = await fetch(field.boundsUrl, { signal: requests.signal })
    if (!response.ok) throw new Error(`Field boundary request failed (${response.status})`)
    const geojson = await response.json() as {
      features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[]
    }
    if (viewer.isDestroyed()) return

    const polygons = geojson.features.flatMap(({ geometry }) => {
      const rings = geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as number[][][][]).map(polygon => polygon[0])
        : [(geometry.coordinates as number[][][])[0]]
      return rings.map(ring => new Cesium.ClippingPolygon({
        positions: Cesium.Cartesian3.fromDegreesArray(insetRing(ring, TERRAIN_CUT_INSET_M)),
      }))
    })
    terrainCut = new Cesium.ClippingPolygonCollection({ polygons, enabled: false })
    viewer.scene.globe.clippingPolygons = terrainCut
    applyLayerSettings()
  }

  async function loadMesh(url: string) {
    // ODM writes the mesh in WGS84 ellipsoidal heights, the same frame as Cesium terrain: no offset.
    const tileset = await Cesium.Cesium3DTileset.fromUrl(url, {
      maximumScreenSpaceError: 16,
      // Mesh tiles carry large texture atlases; bound what stays cached on the GPU.
      cacheBytes: 768 * 1024 * 1024,
    })
    if (viewer.isDestroyed()) return
    mesh = viewer.scene.primitives.add(tileset) as Cesium.Cesium3DTileset
    await cutTerrainUnderField()
  }

  async function loadSplat(url: string) {
    const tileset = await Cesium.Cesium3DTileset.fromUrl(url)
    if (viewer.isDestroyed()) return
    splat = viewer.scene.primitives.add(tileset) as Cesium.Cesium3DTileset
    applyLayerSettings()
  }

  function pickHeight(position: Cesium.Cartesian2): PickedHeight | null {
    const { scene } = viewer
    let world: Cesium.Cartesian3 | undefined
    let source: PickedHeight['source'] = 'terrain'

    // Splats cannot be depth-picked, so readings come from the mesh where it is shown.
    const picked = scene.pick(position)
    if (mesh?.show && picked && (picked as { primitive?: unknown }).primitive === mesh) {
      world = scene.pickPosition(position)
      source = 'mesh'
    }
    if (!world) {
      const ray = viewer.camera.getPickRay(position)
      world = ray ? scene.globe.pick(ray, scene) : undefined
    }
    if (!world) return null

    const carto = Cesium.Cartographic.fromCartesian(world)
    return {
      longitude: Cesium.Math.toDegrees(carto.longitude),
      latitude: Cesium.Math.toDegrees(carto.latitude),
      ellipsoidalHeight: carto.height,
      source,
    }
  }

  const clicks = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
  clicks.setInputAction(({ position }: { position: Cesium.Cartesian2 }) => {
    const reading = pickHeight(position)
    pickMarker.removeAll()
    if (reading) {
      pickMarker.add({
        position: Cesium.Cartesian3.fromDegrees(reading.longitude, reading.latitude, reading.ellipsoidalHeight),
        pixelSize: 9,
        color: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#181a1b'),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      })
    }
    viewer.scene.requestRender()
    onHeightPicked(reading)
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  function reportLoadFailure(layer: string, error: unknown) {
    if (!viewer.isDestroyed()) console.warn(`Failed to load ${layer}:`, error)
  }

  setBaseMap()
  flyToField(viewer, field.bounds, '3d', 2.5)
  // Each layer can finish independently; late arrivals use the latest settings.
  void loadOrthophoto().catch(error => reportLoadFailure('orthophoto', error))
  void loadFlightPath().catch(error => reportLoadFailure('flight path', error))
  void loadBoundary().catch(error => reportLoadFailure('field boundary', error))
  if (field.layers?.meshUrl) {
    void loadMesh(field.layers.meshUrl).catch(error => reportLoadFailure('mesh', error))
  }
  if (field.layers?.splatUrl) {
    void loadSplat(field.layers.splatUrl).catch(error => reportLoadFailure('splat', error))
  }

  return {
    update(next: MapSettings) {
      if (viewer.isDestroyed()) return
      const baseMapChanged = next.baseMap !== settings.baseMap
      settings = next
      if (baseMapChanged) setBaseMap()
      applyLayerSettings()
    },
    flyToField(mode: ViewMode) {
      if (!viewer.isDestroyed()) flyToField(viewer, field.bounds, mode)
    },
    clearPick() {
      pickMarker.removeAll()
      viewer.scene.requestRender()
    },
    destroy() {
      requests.abort()
      clicks.destroy()
      removeOrbitControls()
      if (!viewer.isDestroyed()) viewer.destroy()
    },
  }
}
