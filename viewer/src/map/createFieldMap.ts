import * as Cesium from 'cesium'
import type { FieldMetadata, HeightLayerKey } from '../config/callisRoad'
import { isHandheld } from '../config/runtime'
import { alignmentMatrix, shiftBounds, shiftDegrees } from './alignment'
import { flyToField, installOrbitControls, type ViewMode } from './camera'
import { parseFlightShots } from './flightShots'

/**
 * Satellite sources differ in date, resolution, and georeferencing, so a survey can line up with
 * one better than another. USGS imagery is USDA NAIP aerial photography in the US.
 */
const BASE_MAPS = {
  usgs: () => Cesium.ArcGisMapServerImageryProvider.fromUrl(
    'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer',
  ),
  bing: () => Cesium.createWorldImageryAsync({ style: Cesium.IonWorldImageryStyle.AERIAL }),
  esri: () => Cesium.ArcGisMapServerImageryProvider.fromUrl(
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
  ),
  road: () => Cesium.createWorldImageryAsync({ style: Cesium.IonWorldImageryStyle.ROAD }),
} satisfies Record<string, () => Promise<Cesium.ImageryProvider>>

export type BaseMap = keyof typeof BASE_MAPS

/**
 * Colour correction toward the drone imagery, measured as mean colour over the same field at
 * Callis Road (drone RGB 121/120/99, saturation 0.22): USGS matched as-is, Bing was ~40% darker
 * and flatter, Esri brighter and more saturated. Keeps the seam at the survey edge quiet.
 */
const BASE_MAP_GRADE: Record<BaseMap, { brightness?: number, saturation?: number }> = {
  usgs: {},
  bing: { brightness: 1.65, saturation: 1.55 },
  esri: { brightness: 0.82, saturation: 0.7 },
  road: {},
}

export type HeightLayerChoice = HeightLayerKey | 'none'

export type MapSettings = {
  baseMap: BaseMap
  orthoVisible: boolean
  opacity: number
  flightPathVisible: boolean
  boundaryVisible: boolean
  meshVisible: boolean
  splatVisible: boolean
  heightLayer: HeightLayerChoice
}

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  baseMap: 'usgs',
  orthoVisible: true,
  opacity: 1,
  flightPathVisible: false,
  boundaryVisible: false,
  meshVisible: true,
  splatVisible: false,
  heightLayer: 'none',
}

/**
 * World terrain is cut out inside the field so it can never poke through the survey (the two
 * surfaces sit within centimetres, and Cesium's terrain is coarser). The cut stays this far
 * inside the boundary, so at the ragged edges the orthophoto-draped terrain still fills in
 * underneath the mesh and splat.
 */
const TERRAIN_CUT_INSET_M = 25

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
  /** Cesium ion token from config.json; falls back to the build-time VITE_CESIUM_ION_TOKEN. */
  ionToken?: string
  onOrthophotoLoaded: () => void
  onMeshLoaded: () => void
  onHeightPicked: (picked: PickedHeight | null) => void
}

/** Owns Cesium resources and asynchronous layers for one mounted map. */
export function createFieldMap({
  container, credits, field, ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN,
  onOrthophotoLoaded, onMeshLoaded, onHeightPicked,
}: FieldMapOptions) {
  if (ionToken) Cesium.Ion.defaultAccessToken = ionToken
  // Phones get coarser detail levels: less to download, less GPU memory.
  const screenSpaceError = isHandheld() ? 24 : 16

  // Debug mode (dev, or ?debug in production) exposes the viewer and keeps frames readable.
  const debug = import.meta.env.DEV || new URLSearchParams(location.search).has('debug')

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
    contextOptions: debug ? { webgl: { preserveDrawingBuffer: true } } : undefined,
  })

  // Trade a little tile detail for smoother navigation, and retain visited tiles.
  viewer.scene.globe.maximumScreenSpaceError = 3
  viewer.scene.globe.tileCacheSize = 1000
  viewer.scene.globe.depthTestAgainstTerrain = true
  // While imagery streams in, show an earth tone (not Cesium's blue) and keep coarser parent and
  // neighbouring tiles ready so there are no empty holes when panning and zooming.
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#4a4a3c')
  viewer.scene.globe.preloadAncestors = true
  viewer.scene.globe.preloadSiblings = true
  viewer.scene.globe.tileCacheSize = 2000
  // Inside the terrain cut, anything the survey doesn't cover shows soil-coloured ground (the
  // globe's underside) rather than the starfield.
  viewer.scene.globe.backFaceCulling = false
  viewer.scene.globe.undergroundColor = Cesium.Color.fromCssColorString('#4a4a3c')

  // Registration of the survey to the basemap (see SurveyAlignment); identity when absent.
  const alignment = field.layers?.alignment
  const surveyToWorld = alignmentMatrix(alignment)
  const removeOrbitControls = installOrbitControls(viewer)
  if (debug) Object.assign(window, { fieldViewer: viewer })

  let settings = DEFAULT_MAP_SETTINGS
  let baseLayer: Cesium.ImageryLayer | undefined
  let orthophoto: Cesium.ImageryLayer | undefined
  let flightPath: Cesium.Entity | undefined
  let flightPoints: Cesium.PointPrimitiveCollection | undefined
  let boundary: Cesium.GeoJsonDataSource | undefined
  let mesh: Cesium.Cesium3DTileset | undefined
  let terrainCut: Cesium.ClippingPolygonCollection | undefined
  let splat: Cesium.Cesium3DTileset | undefined
  const heightOverlays = new Map<HeightLayerKey, Cesium.ImageryLayer>()
  const pickMarker = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection()) as Cesium.PointPrimitiveCollection
  const requests = new AbortController()

  /**
   * Survey imagery as a provider: a tile pyramid when the pipeline cut one (fast to pan and zoom),
   * otherwise one large image. Tiles already carry the alignment shift; the rectangle only
   * stops Cesium requesting tiles outside the survey.
   */
  function surveyImagery(tilesUrl: string | undefined, imageUrl: string, bounds: FieldMetadata['bounds'], maximumLevel: number) {
    const { west, south, east, north } = shiftBounds(alignment, bounds)
    const rectangle = Cesium.Rectangle.fromDegrees(west, south, east, north)
    return tilesUrl
      ? Promise.resolve(new Cesium.UrlTemplateImageryProvider({ url: tilesUrl, rectangle, minimumLevel: 14, maximumLevel }))
      : Cesium.SingleTileImageryProvider.fromUrl(imageUrl, { rectangle })
  }

  /** Height maps are 2D products draped on the ground, the same way the orthophoto is. */
  function heightOverlay(key: HeightLayerKey) {
    const raster = field.layers?.heights?.[key]
    const bounds = field.layers?.heights?.bounds
    if (!raster || !bounds) return undefined
    let layer = heightOverlays.get(key)
    if (!layer) {
      layer = Cesium.ImageryLayer.fromProviderAsync(surveyImagery(raster.tilesUrl, raster.url, bounds, 19), {})
      viewer.imageryLayers.add(layer)
      heightOverlays.set(key, layer)
    }
    return layer
  }

  function applyLayerSettings() {
    // A height map lies on the ground, so the mesh steps aside while one is on.
    const meshShown = Boolean(mesh) && settings.meshVisible && settings.heightLayer === 'none'
    if (orthophoto) {
      orthophoto.show = settings.orthoVisible
      orthophoto.alpha = settings.opacity
    }
    if (flightPath) flightPath.show = settings.flightPathVisible
    if (flightPoints) flightPoints.show = settings.flightPathVisible
    if (boundary) boundary.show = settings.boundaryVisible
    if (mesh) mesh.show = meshShown
    // Either 3D layer shown: keep terrain from occluding it inside the field.
    if (terrainCut) terrainCut.enabled = meshShown || Boolean(splat && settings.splatVisible)
    if (splat) splat.show = settings.splatVisible

    for (const layer of heightOverlays.values()) layer.show = false
    if (settings.heightLayer !== 'none') {
      const overlay = heightOverlay(settings.heightLayer)
      if (overlay) overlay.show = true
    }

    viewer.scene.requestRender()
  }

  function setBaseMap() {
    const next = Cesium.ImageryLayer.fromProviderAsync(
      BASE_MAPS[settings.baseMap](),
      BASE_MAP_GRADE[settings.baseMap],
    )
    viewer.imageryLayers.add(next, 0)
    if (baseLayer) viewer.imageryLayers.remove(baseLayer, true)
    baseLayer = next
  }

  async function loadOrthophoto() {
    const provider = await surveyImagery(field.layers?.orthoTilesUrl, field.orthophotoUrl, field.bounds, 21)
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
      Cesium.Matrix4.multiplyByPoint(surveyToWorld, Cesium.Cartesian3.fromDegrees(...coordinates), new Cesium.Cartesian3()),
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

  type BoundaryGeoJson = {
    type: string
    features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[]
  }
  let boundaryRequest: Promise<BoundaryGeoJson> | undefined

  /** The field boundary, shifted horizontally by the survey alignment. Fetched once. */
  function fetchBoundary() {
    boundaryRequest ??= (async () => {
      const response = await fetch(field.boundsUrl, { signal: requests.signal })
      if (!response.ok) throw new Error(`Field boundary request failed (${response.status})`)
      const geojson = await response.json() as BoundaryGeoJson
      const shiftRing = (ring: number[][]) => ring.map(([lon, lat, ...rest]) => [...shiftDegrees(alignment, lon, lat), ...rest])
      for (const { geometry } of geojson.features) {
        geometry.coordinates = geometry.type === 'MultiPolygon'
          ? (geometry.coordinates as number[][][][]).map(polygon => polygon.map(shiftRing))
          : (geometry.coordinates as number[][][]).map(shiftRing)
      }
      return geojson
    })()
    return boundaryRequest
  }

  async function loadBoundary() {
    const source = await Cesium.GeoJsonDataSource.load(await fetchBoundary(), {
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

  async function cutTerrainUnderField() {
    const geojson = await fetchBoundary()
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
    // ODM writes the mesh in WGS84 ellipsoidal heights, the same frame as Cesium terrain; the
    // alignment then corrects the survey's own GPS error (no ground control).
    const tileset = await Cesium.Cesium3DTileset.fromUrl(url, {
      maximumScreenSpaceError: screenSpaceError,
      // Bound what stays cached on the GPU; phones get a smaller budget.
      cacheBytes: (isHandheld() ? 256 : 768) * 1024 * 1024,
    })
    if (viewer.isDestroyed()) return
    tileset.modelMatrix = surveyToWorld
    mesh = viewer.scene.primitives.add(tileset) as Cesium.Cesium3DTileset
    const removeListener = tileset.initialTilesLoaded.addEventListener(() => {
      removeListener()
      onMeshLoaded()
    })
    applyLayerSettings()
  }

  async function loadSplat(url: string) {
    const tileset = await Cesium.Cesium3DTileset.fromUrl(url, {
      maximumScreenSpaceError: screenSpaceError,
      // Coarser splat levels while the camera moves; full detail once it settles.
      dynamicScreenSpaceError: true,
      cullRequestsWhileMoving: true,
      cacheBytes: (isHandheld() ? 256 : 768) * 1024 * 1024,
    })
    if (viewer.isDestroyed()) return
    tileset.modelMatrix = surveyToWorld
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

  // Render only when something changes. A splat sorts its Gaussians asynchronously after the
  // camera moves, so keep drawing briefly after each move to show the settled sort.
  let settleUntil = 0
  const settle = () => {
    if (performance.now() < settleUntil || viewer.isDestroyed()) {
      viewer.scene.requestRender()
      requestAnimationFrame(settle)
    }
  }
  viewer.camera.percentageChanged = 0.01
  const removeCameraListener = viewer.camera.changed.addEventListener(() => {
    if (!splat?.show) return
    const running = performance.now() < settleUntil
    settleUntil = performance.now() + 600
    if (!running) requestAnimationFrame(settle)
  })

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
  if (field.layers?.meshUrl || field.layers?.splatUrl) {
    void cutTerrainUnderField().catch(error => reportLoadFailure('terrain cut', error))
  }
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
      removeCameraListener()
      removeOrbitControls()
      if (!viewer.isDestroyed()) viewer.destroy()
    },
  }
}
