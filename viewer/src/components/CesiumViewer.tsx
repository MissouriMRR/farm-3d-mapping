import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import './CesiumViewer.css'

export default function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const viewer = new Cesium.Viewer(containerRef.current, {
      timeline: false,
      animation: false,
      baseLayerPicker: true,
      geocoder: false,
      homeButton: true,
      sceneModePicker: true,
      navigationHelpButton: false,
      fullscreenButton: false,
    })

    viewerRef.current = viewer

    return () => {
      if (!viewer.isDestroyed()) {
        viewer.destroy()
      }
      viewerRef.current = null
    }
  }, [])

  return (
    <div className="cesium-wrapper">
      <div className="viewer-header">
        <h1>Farm 3D Mapping - Digital Twin</h1>
        <span className="subtitle">CesiumJS Viewer Prototype</span>
      </div>
      <div ref={containerRef} className="cesium-container" />
    </div>
  )
}
