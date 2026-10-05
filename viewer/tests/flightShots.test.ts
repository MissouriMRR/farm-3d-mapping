import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseFlightShots } from '../src/map/flightShots.ts'

function shot(captureTime: unknown, coordinates: unknown = [-93.27, 38.78, 266]) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: { capture_time: captureTime },
  }
}

test('orders flight positions by capture time without changing the source data', () => {
  const features = [shot(20, [1, 2, 3]), shot(10, [4, 5, 6])]
  const result = parseFlightShots({ type: 'FeatureCollection', features })

  assert.deepEqual(result.map(point => point.coordinates), [[4, 5, 6], [1, 2, 3]])
  assert.equal(features[0].properties.capture_time, 20)
})

test('keeps the existing zero-time fallback for missing capture times', () => {
  const result = parseFlightShots({
    type: 'FeatureCollection',
    features: [shot(10), shot(undefined)],
  })

  assert.deepEqual(result.map(point => point.captureTime), [0, 10])
})

test('rejects malformed data before it reaches Cesium', () => {
  for (const data of [null, {}, { type: 'FeatureCollection', features: 'invalid' }]) {
    assert.throws(() => parseFlightShots(data), /FeatureCollection/)
  }
  for (const feature of [
    { geometry: { type: 'LineString', coordinates: [] } },
    shot(10, [1, 2]),
    shot(10, [1, 2, Infinity]),
    shot(10, ['1', 2, 3]),
    shot('yesterday'),
  ]) {
    assert.throws(() => parseFlightShots({ type: 'FeatureCollection', features: [feature] }), /Flight shot 0/)
  }
})

test('accepts an empty collection', () => {
  assert.deepEqual(parseFlightShots({ type: 'FeatureCollection', features: [] }), [])
})

test('reads all 393 shots from the checked-in Callis Road survey', () => {
  const data: unknown = JSON.parse(readFileSync(
    new URL('../public/data/callis-road/shots.geojson', import.meta.url),
    'utf8',
  ))
  const shots = parseFlightShots(data)

  assert.equal(shots.length, 393)
  assert.ok(shots.every((shot, index) => index === 0 || shot.captureTime >= shots[index - 1].captureTime))
})
