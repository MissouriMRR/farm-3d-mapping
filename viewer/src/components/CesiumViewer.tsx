import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { CALLIS_ROAD_METADATA } from '../config/callisRoad'
import './CesiumViewer.css'

export default function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!containerRef.current) return

    const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN
    if (ionToken) {
      Cesium.Ion.defaultAccessToken = ionToken
    }

    // Initialize Cesium viewer with World Terrain
    const viewer = new Cesium.Viewer(containerRef.current, {
      timeline: false,
      animation: false,
      baseLayerPicker: true,
      geocoder: false,
      homeButton: true,
      sceneModePicker: true,
      navigationHelpButton: false,
      fullscreenButton: false,
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
      if (!viewer.isDestroyed()) {
        viewer.destroy()
      }
      viewerRef.current = null
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

  return (
    <div className="cesium-wrapper">
      {/* Top Header */}
      <div className="viewer-header">
        <div className="header-titles">
          <h1>Farm 3D Mapping - Digital Twin</h1>
          <span className="subtitle">
            {CALLIS_ROAD_METADATA.name} • {CALLIS_ROAD_METADATA.date}
          </span>
        </div>
        <div className="status-badge">
          <span className={`status-dot ${isLoaded ? 'active' : 'loading'}`} />
          {isLoaded ? 'Orthophoto Draped' : 'Loading Orthophoto...'}
        </div>
      </div>

      {/* Layer Controls Panel */}
      <div className="layer-controls-panel">
        <div className="panel-title">Map Layers</div>

        {/* Orthophoto Checkbox */}
        <div className="control-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={orthoVisible}
              onChange={(e) => setOrthoVisible(e.target.checked)}
            />
            <span className="label-text">
              <span className="legend-swatch swatch-ortho" />
              Callis Road Orthophoto
            </span>
          </label>
        </div>

        {/* Opacity Slider */}
        {orthoVisible && (
          <div className="control-group slider-group">
            <div className="slider-header">
              <span>Layer Opacity</span>
              <span>{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="slider"
            />
          </div>
        )}

        {/* Flight Trajectory Checkbox */}
        <div className="control-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={flightPathVisible}
              onChange={(e) => setFlightPathVisible(e.target.checked)}
            />
            <span className="label-text">
              <span className="legend-swatch swatch-flight" />
              Flight Trajectory ({CALLIS_ROAD_METADATA.shotsCount} shots)
            </span>
          </label>
        </div>

        {/* Field Boundary Checkbox */}
        <div className="control-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={boundaryVisible}
              onChange={(e) => setBoundaryVisible(e.target.checked)}
            />
            <span className="label-text">
              <span className="legend-swatch swatch-boundary" />
              Field Boundary
            </span>
          </label>
        </div>

        {/* View Preset Buttons */}
        <div className="control-group view-buttons">
          <button
            type="button"
            className={`btn-view ${viewMode === '3d' ? 'active' : ''}`}
            onClick={() => flyToField('3d')}
          >
            3D Tilt
          </button>
          <button
            type="button"
            className={`btn-view ${viewMode === 'top-down' ? 'active' : ''}`}
            onClick={() => flyToField('top-down')}
          >
            Top-Down (2D)
          </button>
        </div>

        {/* Metadata Footer */}
        <div className="meta-footer">
          <div><strong>Resolution:</strong> {CALLIS_ROAD_METADATA.gsd}</div>
          <div><strong>Altitude:</strong> {CALLIS_ROAD_METADATA.flightAltitude}</div>
          <div><strong>CRS:</strong> WGS84 (EPSG:4326) / UTM 15N</div>
        </div>
      </div>

      <div ref={containerRef} className="cesium-container" />
    </div>
  )
}

