import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CALLIS_ROAD_METADATA } from '../src/config/callisRoad.ts'
import { ellipsoidalToNavd88, formatEllipsoidal, formatNavd88 } from '../src/map/datum.ts'

const { navd88Offset } = CALLIS_ROAD_METADATA

test('converts Callis Road ellipsoidal heights to NAVD88 with the field offset', () => {
  // The lowest ODM cloud point (201.8 m ellipsoidal) sits on 3DEP's lowest ground (~234.9 m NAVD88).
  assert.ok(Math.abs(ellipsoidalToNavd88(201.1, navd88Offset) - 234.9) < 0.5)
})

test('labels displayed heights with their datum', () => {
  assert.equal(formatNavd88(215.2, navd88Offset), '249 m NAVD88')
  assert.equal(formatEllipsoidal(215.24), '215.2 m WGS84 ellipsoid')
})

test('never labels a height as MSL', () => {
  const { flightAltitude } = CALLIS_ROAD_METADATA
  assert.doesNotMatch(flightAltitude, /MSL/)
  assert.match(flightAltitude, /NAVD88/)
})
