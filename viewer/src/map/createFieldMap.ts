import * as Cesium from 'cesium'
import type { FieldMetadata } from '../config/callisRoad'
import { flyToField, installOrbitControls, type ViewMode } from './camera'
import { parseFlightShots } from './flightShots'

const BASE_MAP_STYLES = {
  satellite: Cesium.IonWorldImageryStyle.AERIAL,
  hybrid: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS,
  road: Cesium.IonWorldImageryStyle.ROAD,
}

export type MapSettings = {
  baseMap: keyof typeof BASE_MAP_STYLES
  orthoVisible: boolean
  opacity: number
  flightPathVisible: boolean
  boundaryVisible: boolean
}

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  baseMap: 'satellite',
  orthoVisible: true,
  opacity: 1,
  flightPathVisible: false,
  boundaryVisible: false,
}

type FieldMapOptions = {
  container: HTMLElement
  credits: HTMLElement
  field: FieldMetadata
  onOrthophotoLoaded: () => void
}

/** Owns Cesium resources and asynchronous layers for one mounted map. */
export function createFieldMap({ container, credits, field, onOrthophotoLoaded }: FieldMapOptions) {
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

  let settings = DEFAULT_MAP_SETTINGS
  let baseLayer: Cesium.ImageryLayer | undefined
  let orthophoto: Cesium.ImageryLayer | undefined
  let flightPath: Cesium.Entity | undefined
  let flightPoints: Cesium.PointPrimitiveCollection | undefined
  let boundary: Cesium.GeoJsonDataSource | undefined
  const requests = new AbortController()

  function applyLayerSettings() {
    if (orthophoto) {
      orthophoto.show = settings.orthoVisible
      orthophoto.alpha = settings.opacity
    }
    if (flightPath) flightPath.show = settings.flightPathVisible
    if (flightPoints) flightPoints.show = settings.flightPathVisible
    if (boundary) boundary.show = settings.boundaryVisible
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

  function reportLoadFailure(layer: string, error: unknown) {
    if (!viewer.isDestroyed()) console.warn(`Failed to load ${layer}:`, error)
  }

  setBaseMap()
  flyToField(viewer, field.bounds, '3d', 2.5)
  // Each layer can finish independently; late arrivals use the latest settings.
  void loadOrthophoto().catch(error => reportLoadFailure('orthophoto', error))
  void loadFlightPath().catch(error => reportLoadFailure('flight path', error))
  void loadBoundary().catch(error => reportLoadFailure('field boundary', error))

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
    destroy() {
      requests.abort()
      removeOrbitControls()
      if (!viewer.isDestroyed()) viewer.destroy()
    },
  }
}
