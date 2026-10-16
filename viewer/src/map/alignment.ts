import * as Cesium from 'cesium'
import type { FieldMetadata, SurveyAlignment } from '../config/callisRoad'

const EARTH_RADIUS = 6378137

/**
 * World-space transform that registers survey geometry (mesh, splat, flight path) to the basemap:
 * F * A * F^-1, where F is the east-north-up frame at the alignment reference and A shifts each
 * local point by (east, north, up + slopeEast * e + slopeNorth * n).
 */
export function alignmentMatrix(alignment: SurveyAlignment | undefined): Cesium.Matrix4 {
  if (!alignment) return Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY)
  const { reference, east, north, up, slopeEast, slopeNorth } = alignment
  const frame = Cesium.Transforms.eastNorthUpToFixedFrame(
    Cesium.Cartesian3.fromDegrees(reference.longitude, reference.latitude, 0),
  )
  // Matrix4's constructor takes rows.
  const local = new Cesium.Matrix4(
    1, 0, 0, east,
    0, 1, 0, north,
    slopeEast, slopeNorth, 1, up,
    0, 0, 0, 1,
  )
  const inverse = Cesium.Matrix4.inverseTransformation(frame, new Cesium.Matrix4())
  const result = Cesium.Matrix4.multiply(frame, local, new Cesium.Matrix4())
  return Cesium.Matrix4.multiply(result, inverse, result)
}

/** The horizontal part of the alignment, for things draped on the ground (imagery, outlines). */
export function shiftDegrees(alignment: SurveyAlignment | undefined, lon: number, lat: number): [number, number] {
  if (!alignment) return [lon, lat]
  const dLat = (alignment.north / EARTH_RADIUS) * (180 / Math.PI)
  const dLon = (alignment.east / (EARTH_RADIUS * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI)
  return [lon + dLon, lat + dLat]
}

export function shiftBounds(
  alignment: SurveyAlignment | undefined,
  { west, south, east, north }: FieldMetadata['bounds'],
): FieldMetadata['bounds'] {
  const [w, s] = shiftDegrees(alignment, west, south)
  const [e, n] = shiftDegrees(alignment, east, north)
  return { west: w, south: s, east: e, north: n }
}
