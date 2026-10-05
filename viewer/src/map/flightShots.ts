type FlightShot = {
  coordinates: [longitude: number, latitude: number, altitude: number]
  captureTime: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Validate the file at the network boundary and return shots in flight order. */
export function parseFlightShots(data: unknown): FlightShot[] {
  if (!isRecord(data) || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Flight shots must be a GeoJSON FeatureCollection')
  }

  const shots = data.features.map((feature: unknown, index): FlightShot => {
    if (!isRecord(feature) || !isRecord(feature.geometry) || feature.geometry.type !== 'Point') {
      throw new Error(`Flight shot ${index} must have Point geometry`)
    }

    const coordinates: unknown = feature.geometry.coordinates
    if (!Array.isArray(coordinates) || coordinates.length < 3) {
      throw new Error(`Flight shot ${index} needs longitude, latitude, and altitude`)
    }
    const [longitude, latitude, altitude]: unknown[] = coordinates
    if (
      typeof longitude !== 'number' || !Number.isFinite(longitude) ||
      typeof latitude !== 'number' || !Number.isFinite(latitude) ||
      typeof altitude !== 'number' || !Number.isFinite(altitude)
    ) {
      throw new Error(`Flight shot ${index} has invalid coordinates`)
    }

    const captureTime = isRecord(feature.properties) ? feature.properties.capture_time ?? 0 : 0
    if (typeof captureTime !== 'number' || !Number.isFinite(captureTime)) {
      throw new Error(`Flight shot ${index} has an invalid capture time`)
    }

    return { coordinates: [longitude, latitude, altitude], captureTime }
  })

  return shots.sort((a, b) => a.captureTime - b.captureTime)
}
