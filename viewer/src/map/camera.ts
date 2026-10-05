import * as Cesium from 'cesium'
import type { FieldMetadata } from '../config/callisRoad'

export type ViewMode = '3d' | 'top-down'

/**
 * Orbit-style camera controls that work on a trackpad:
 * drag orbits around the screen centre, two-finger scroll pans, pinch zooms.
 * A mouse wheel still zooms, and right-drag pans for mouse users.
 * Returns a cleanup function.
 */
export function installOrbitControls(viewer: Cesium.Viewer): () => void {
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
    const fovy = camera.frustum instanceof Cesium.PerspectiveFrustum
      ? camera.frustum.fovy ?? Math.PI / 3
      : Math.PI / 3
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
      const legacy = 'wheelDeltaY' in e && typeof e.wheelDeltaY === 'number'
        ? e.wheelDeltaY
        : undefined
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


export function flyToField(
  viewer: Cesium.Viewer,
  bounds: FieldMetadata['bounds'],
  mode: ViewMode,
  duration = 1.5,
) {
  const longitude = (bounds.west + bounds.east) / 2
  const latitude = (bounds.south + bounds.north) / 2
  const topDown = mode === 'top-down'

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      longitude,
      topDown ? latitude : latitude - 0.0035,
      topDown ? 650 : 480,
    ),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(topDown ? -90 : -42),
      roll: 0,
    },
    duration,
  })
}
