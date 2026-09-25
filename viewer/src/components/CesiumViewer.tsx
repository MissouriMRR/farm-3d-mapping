import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { CALLIS_ROAD_METADATA } from '../config/callisRoad'
import './CesiumViewer.css'

type BaseMap = 'satellite' | 'hybrid' | 'road'
type Theme = 'light' | 'dark'

const BASE_MAP_STYLES: Record<BaseMap, Cesium.IonWorldImageryStyle> = {
  satellite: Cesium.IonWorldImageryStyle.AERIAL,
  hybrid: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS,
  road: Cesium.IonWorldImageryStyle.ROAD,
}

const THEME_KEY = 'viewer-theme'

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Orbit-style camera controls that work on a trackpad:
 * drag orbits around the screen centre, two-finger scroll pans, pinch zooms.
 * A mouse wheel still zooms, and right-drag pans for mouse users.
 * Returns a cleanup function.
 */
function installOrbitControls(viewer: Cesium.Viewer): () => void {
  const { scene, camera, canvas } = viewer
  const controller = scene.screenSpaceCameraController
  const { CameraEventType, KeyboardEventModifier } = Cesium

  // Cesium's default "rotate" spins the globe under the cursor, which reads as
  // panning. Orbit (tilt) takes left-drag instead; the wheel is handled below.
  controller.tiltEventTypes = [
    CameraEventType.LEFT_DRAG,
    CameraEventType.MIDDLE_DRAG,
    CameraEventType.PINCH,
  ]
  controller.rotateEventTypes = [
    CameraEventType.RIGHT_DRAG,
    { eventType: CameraEventType.LEFT_DRAG, modifier: KeyboardEventModifier.SHIFT },
  ]
  controller.zoomEventTypes = [CameraEventType.PINCH]
  controller.lookEventTypes = []

  const distanceToGround = () => {
    const carto = camera.positionCartographic
    const ground = scene.globe.getHeight(carto) ?? 0
    return Math.max(carto.height - ground, 1)
  }

  const zoom = (fraction: number) => {
    const distance = distanceToGround()
    // Never zoom through the ground: stop 5 m short.
    const amount = Math.min(fraction * distance, distance - 5)
    camera.zoomIn(amount)
  }

  const pan = (dx: number, dy: number) => {
    // Ground-parallel pan, scaled so content follows the fingers.
    const fovy = (camera.frustum as Cesium.PerspectiveFrustum).fovy ?? Math.PI / 3
    const metersPerPixel = (2 * distanceToGround() * Math.tan(fovy / 2)) / canvas.clientHeight
    const up = scene.globe.ellipsoid.geodeticSurfaceNormal(camera.positionWC, new Cesium.Cartesian3())
    const right = Cesium.Cartesian3.clone(camera.rightWC)
    Cesium.Cartesian3.subtract(
      right,
      Cesium.Cartesian3.multiplyByScalar(up, Cesium.Cartesian3.dot(right, up), new Cesium.Cartesian3()),
      right
    )
    Cesium.Cartesian3.normalize(right, right)
    const forward = Cesium.Cartesian3.cross(up, right, new Cesium.Cartesian3())
    camera.move(right, dx * metersPerPixel)
    camera.move(forward, -dy * metersPerPixel)
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    // Pinch gestures arrive as wheel events with ctrlKey set.
    if (e.ctrlKey) {
      zoom(Math.max(-0.5, Math.min(0.5, -e.deltaY * 0.01)))
    } else {
      // Trackpads report wheelDeltaY as exactly -3x deltaY; mouse wheels don't.
      const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY
      const isTrackpad = legacy ? legacy === -3 * e.deltaY : e.deltaMode === 0 && e.deltaX !== 0
      if (isTrackpad) {
        pan(e.deltaX, e.deltaY)
      } else {
        zoom(e.deltaY < 0 ? 0.15 : -0.15)
      }
    }
    scene.requestRender()
  }

  canvas.addEventListener('wheel', onWheel, { passive: false })
  return () => canvas.removeEventListener('wheel', onWheel)
}

export default function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const creditRef = useRef<HTMLDivElement>(null)
  const baseLayerRef = useRef<Cesium.ImageryLayer | null>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const orthoLayerRef = useRef<Cesium.ImageryLayer | null>(null)
  const flightEntityRef = useRef<Cesium.Entity | null>(null)
  const flightPointsRef = useRef<Cesium.PointPrimitiveCollection | null>(null)
  const boundaryDataSourceRef = useRef<Cesium.GeoJsonDataSource | null>(null)

  const [isLoaded, setIsLoaded] = useState(false)
  const [orthoVisible, setOrthoVisible] = useState(true)
  const [opacity, setOpacity] = useState(1.0)
  const [flightPathVisible, setFlightPathVisible] = useState(false)
  const [boundaryVisible, setBoundaryVisible] = useState(false)
  const [viewMode, setViewMode] = useState<'3d' | 'top-down'>('3d')
  const [baseMap, setBaseMap] = useState<BaseMap>('satellite')
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    if (!containerRef.current || !creditRef.current) return

    const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN
    if (ionToken) {
      Cesium.Ion.defaultAccessToken = ionToken
    }

    // Initialize Cesium viewer with World Terrain
    const viewer = new Cesium.Viewer(containerRef.current, {
      timeline: false,
      animation: false,
      // Cesium's own toolbar is replaced by the side panel: base map, view
      // presets and credits all live there.
      baseLayerPicker: false,
      baseLayer: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      creditContainer: creditRef.current,
      // No vertex normals: they only feed globe lighting, which is off, and
      // they make every terrain tile larger.
      terrain: Cesium.Terrain.fromWorldTerrain({
        requestVertexNormals: false,
        requestWaterMask: false,
      }),
      // Only redraw when the camera moves or data changes instead of every frame.
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      // MSAA at retina resolution is expensive; default is 4 samples.
      msaaSamples: 1,
    })

    const { globe } = viewer.scene
    // Fewer, coarser tiles (default 2). Slightly softer imagery near the horizon.
    globe.maximumScreenSpaceError = 3
    // Keep more tiles in memory so panning back doesn't refetch (default 100).
    globe.tileCacheSize = 1000

    const removeOrbitControls = installOrbitControls(viewer)

    viewerRef.current = viewer

    // Enable depth testing so draped imagery and layers conform directly to terrain
    viewer.scene.globe.depthTestAgainstTerrain = true

    const { bounds, orthophotoUrl, shotsUrl, boundsUrl } = CALLIS_ROAD_METADATA

    // Fly to the field right away; bounds are known up front, so there's no
    // need to wait for any layer to finish loading.
    const centerLon = (bounds.west + bounds.east) / 2
    const centerLat = (bounds.south + bounds.north) / 2
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat - 0.0035, 480),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-42),
        roll: 0.0,
      },
      duration: 2.5,
    })

    // The three layers are independent, so load them in parallel.

    // 1. Drape Orthophoto on Terrain
    const loadOrthophoto = async () => {
      const rectangle = Cesium.Rectangle.fromDegrees(
        bounds.west,
        bounds.south,
        bounds.east,
        bounds.north
      )
      const provider = await Cesium.SingleTileImageryProvider.fromUrl(
        orthophotoUrl,
        { rectangle }
      )
      if (viewer.isDestroyed()) return

      const layer = viewer.imageryLayers.addImageryProvider(provider)
      layer.alpha = 1.0
      layer.show = true
      orthoLayerRef.current = layer
      setIsLoaded(true)
    }

    // 2. Load Drone Flight Path and Camera Shots
    const loadFlightPath = async () => {
      const shotsRes = await fetch(shotsUrl)
      if (!shotsRes.ok || viewer.isDestroyed()) return
      const shotsGeoJson = await shotsRes.json()
      if (viewer.isDestroyed()) return

      const sortedFeatures = [...shotsGeoJson.features].sort((a, b) => {
        const timeA = a.properties?.capture_time ?? 0
        const timeB = b.properties?.capture_time ?? 0
        return timeA - timeB
      })

      const positions = sortedFeatures.map((f) => {
        const [lon, lat, alt] = f.geometry.coordinates
        return Cesium.Cartesian3.fromDegrees(lon, lat, alt)
      })

      // Flight trajectory line
      const flightLine = viewer.entities.add({
        id: 'flight-trajectory',
        show: false,
        polyline: {
          positions,
          width: 2.5,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.25,
            color: Cesium.Color.YELLOW,
          }),
        },
      })
      flightEntityRef.current = flightLine

      // Camera shot points
      const pointCollection = viewer.scene.primitives.add(
        new Cesium.PointPrimitiveCollection()
      )
      const pointColor = Cesium.Color.fromCssColorString('#f59e0b')
      positions.forEach((pos) => {
        pointCollection.add({
          position: pos,
          pixelSize: 4,
          color: pointColor,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
        })
      })
      pointCollection.show = false
      flightPointsRef.current = pointCollection
    }

    // 3. Load Field Boundary Polygon
    const loadBoundary = async () => {
      const boundaryDataSource = await Cesium.GeoJsonDataSource.load(boundsUrl, {
        stroke: Cesium.Color.fromCssColorString('#10b981'),
        strokeWidth: 3,
        fill: Cesium.Color.fromCssColorString('#10b981').withAlpha(0.12),
        clampToGround: true,
      })
      if (viewer.isDestroyed()) return
      boundaryDataSource.show = false
      await viewer.dataSources.add(boundaryDataSource)
      boundaryDataSourceRef.current = boundaryDataSource
    }

    loadOrthophoto().catch((err) => console.error('Failed to load orthophoto:', err))
    loadFlightPath().catch((e) => console.warn('Flight path could not be loaded:', e))
    loadBoundary().catch((e) => console.warn('Field boundary could not be loaded:', e))

    return () => {
      removeOrbitControls()
      if (!viewer.isDestroyed()) {
        viewer.destroy()
      }
      viewerRef.current = null
      baseLayerRef.current = null
      orthoLayerRef.current = null
      flightEntityRef.current = null
      flightPointsRef.current = null
      boundaryDataSourceRef.current = null
    }
  }, [])

  // requestRenderMode only redraws on camera/data changes, so layer
  // property edits must request a frame explicitly.
  const requestRender = () => {
    const viewer = viewerRef.current
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender()
  }

  // Swap the base imagery, keeping it underneath the orthophoto
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return
    const layers = viewer.imageryLayers
    const next = Cesium.ImageryLayer.fromProviderAsync(
      Cesium.createWorldImageryAsync({ style: BASE_MAP_STYLES[baseMap] }),
      {}
    )
    layers.add(next, 0)
    if (baseLayerRef.current) layers.remove(baseLayerRef.current, true)
    baseLayerRef.current = next
    requestRender()
  }, [baseMap])

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // Not persisting is fine; the toggle still works for this session.
    }
  }, [theme])

  // Sync orthophoto visibility & opacity
  useEffect(() => {
    if (orthoLayerRef.current) {
      orthoLayerRef.current.show = orthoVisible
      requestRender()
    }
  }, [orthoVisible])

  useEffect(() => {
    if (orthoLayerRef.current) {
      orthoLayerRef.current.alpha = opacity
      requestRender()
    }
  }, [opacity])

  // Sync flight path visibility
  useEffect(() => {
    if (flightEntityRef.current) {
      flightEntityRef.current.show = flightPathVisible
    }
    if (flightPointsRef.current) {
      flightPointsRef.current.show = flightPathVisible
    }
    requestRender()
  }, [flightPathVisible])

  // Sync boundary visibility
  useEffect(() => {
    if (boundaryDataSourceRef.current) {
      boundaryDataSourceRef.current.show = boundaryVisible
      requestRender()
    }
  }, [boundaryVisible])

  // Handle camera view presets
  const flyToField = (mode: '3d' | 'top-down' = '3d') => {
    const viewer = viewerRef.current
    if (!viewer) return

    const { bounds } = CALLIS_ROAD_METADATA
    const centerLon = (bounds.west + bounds.east) / 2
    const centerLat = (bounds.south + bounds.north) / 2

    if (mode === 'top-down') {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 650),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-90), // Straight down nadir
          roll: 0.0,
        },
        duration: 1.5,
      })
      setViewMode('top-down')
    } else {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat - 0.0035, 480),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-42), // Oblique 3D
          roll: 0.0,
        },
        duration: 1.5,
      })
      setViewMode('3d')
    }
  }

  const { name, date, gsd, flightAltitude, shotsCount, orthophotoUrl } = CALLIS_ROAD_METADATA

  return (
    <div className="cesium-wrapper" data-theme={theme}>
      <aside className="side-panel">
        <header className="panel-head">
          <div className="panel-titles">
            <h1>Farm 3D Mapping - Digital Twin</h1>
            <span className="subtitle">
              {name} • {date}
            </span>
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="3" />
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />
              </svg>
            )}
          </button>
          <div className="status" role="status">
            <span className={`status-dot ${isLoaded ? 'active' : 'loading'}`} />
            {isLoaded ? 'Orthophoto Draped' : 'Loading Orthophoto...'}
          </div>
        </header>

        <section className="panel-group">
          <h2 className="group-title">Map Layers</h2>
          <label className="layer-row">
            <input
              type="checkbox"
              checked={orthoVisible}
              onChange={(e) => setOrthoVisible(e.target.checked)}
            />
            <span
              className="layer-symbol symbol-ortho"
              style={{ backgroundImage: `url(${orthophotoUrl})` }}
            />
            Callis Road Orthophoto
          </label>
          {orthoVisible && (
            <div className="opacity-row">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                aria-label="Layer Opacity"
              />
              <span className="opacity-value">{Math.round(opacity * 100)}%</span>
            </div>
          )}
          <label className="layer-row">
            <input
              type="checkbox"
              checked={flightPathVisible}
              onChange={(e) => setFlightPathVisible(e.target.checked)}
            />
            <svg className="layer-symbol" viewBox="0 0 26 16" aria-hidden="true">
              <polyline className="symbol-flight-line" points="2,13 9,4 16,10 24,3" />
              <circle className="symbol-flight-shot" cx="9" cy="4" r="1.8" />
              <circle className="symbol-flight-shot" cx="16" cy="10" r="1.8" />
            </svg>
            Flight Trajectory ({shotsCount} shots)
          </label>
          <label className="layer-row">
            <input
              type="checkbox"
              checked={boundaryVisible}
              onChange={(e) => setBoundaryVisible(e.target.checked)}
            />
            <svg className="layer-symbol" viewBox="0 0 26 16" aria-hidden="true">
              <rect className="symbol-boundary" x="2" y="2" width="22" height="12" rx="1" />
            </svg>
            Field Boundary
          </label>
        </section>

        <section className="panel-group">
          <h2 className="group-title">Base Map</h2>
          <div className="segmented" role="group" aria-label="Base Map">
            {(
              [
                ['satellite', 'Satellite'],
                ['hybrid', 'Hybrid'],
                ['road', 'Road'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={baseMap === value}
                onClick={() => setBaseMap(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="panel-group">
          <h2 className="group-title">View</h2>
          <div className="segmented" role="group" aria-label="View">
            <button
              type="button"
              aria-pressed={viewMode === '3d'}
              onClick={() => flyToField('3d')}
            >
              3D Tilt
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'top-down'}
              onClick={() => flyToField('top-down')}
            >
              Top-Down (2D)
            </button>
          </div>
        </section>

        <section className="panel-group group-survey">
          <h2 className="group-title">Survey</h2>
          <dl className="survey-table">
            <dt>Resolution</dt>
            <dd>{gsd}</dd>
            <dt>Altitude</dt>
            <dd>{flightAltitude}</dd>
            <dt>CRS</dt>
            <dd>WGS84 (EPSG:4326) / UTM 15N</dd>
          </dl>
        </section>

        <div ref={creditRef} className="panel-credits" />
      </aside>

      <main className="map-area">
        <div ref={containerRef} className="cesium-container" />
      </main>
    </div>
  )
}
