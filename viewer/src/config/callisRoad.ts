export interface FieldMetadata {
  name: string
  date: string
  gsd: string
  shotsCount: number
  flightAltitude: string
  bounds: {
    west: number
    south: number
    east: number
    north: number
  }
  center: {
    longitude: number
    latitude: number
    elevation: number
  }
  orthophotoUrl: string
  shotsUrl: string
  boundsUrl: string
}

export const CALLIS_ROAD_METADATA: FieldMetadata = {
  name: 'Callis Road (Field 175)',
  date: 'September 4, 2026',
  gsd: '5.0 cm/px',
  shotsCount: 393,
  flightAltitude: '~50m AGL (266m MSL)',
  bounds: {
    west: -93.27553855376439,
    south: 38.784307630549215,
    east: -93.27265005724189,
    north: 38.78764669091608,
  },
  center: {
    longitude: -93.274094,
    latitude: 38.785977,
    elevation: 215, // meters MSL
  },
  orthophotoUrl: '/data/callis-road/callis_orthophoto.webp',
  shotsUrl: '/data/callis-road/shots.geojson',
  boundsUrl: '/data/callis-road/bounds.geojson',
}
