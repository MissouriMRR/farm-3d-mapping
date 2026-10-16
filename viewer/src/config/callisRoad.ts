export type HeightLayerKey = 'dsm' | 'dtm' | 'canopy'

/** A colour-ramped height raster rendered by the pipeline; min and max are the ramp ends in metres. */
export interface HeightRaster {
  url: string
  /** XYZ tile pyramid (`{z}/{x}/{y}`), preferred over the single image when present. */
  tilesUrl?: string
  min: number
  max: number
}

/**
 * A survey without ground control can sit metres off. This registers it to the basemap:
 * in local east/north/up metres around `reference`, every survey point moves by
 * (east, north, up + slopeEast * e + slopeNorth * n).
 */
export interface SurveyAlignment {
  reference: { latitude: number, longitude: number }
  east: number
  north: number
  up: number
  slopeEast: number
  slopeNorth: number
}

/** Products of a full ODM run. Generated files are gitignored; see pipeline/README.md. */
export interface SurveyLayers {
  alignment?: SurveyAlignment
  /** Orthophoto as an XYZ tile pyramid with the alignment baked in (pipeline/tile_imagery.sh). */
  orthoTilesUrl?: string
  meshUrl?: string
  splatUrl?: string
  heights?: {
    bounds: FieldMetadata['bounds']
  } & Partial<Record<HeightLayerKey, HeightRaster>>
}

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
    /** Meters, WGS84 ellipsoidal height (the frame ODM and Cesium share). */
    elevation: number
  }
  /** Meters added to an ellipsoidal height to get NAVD88; constant to within millimetres over the field. */
  navd88Offset: number
  orthophotoUrl: string
  shotsUrl: string
  boundsUrl: string
  layers?: SurveyLayers
}

export const CALLIS_ROAD_METADATA: FieldMetadata = {
  name: 'Callis Road (Field 175)',
  date: 'September 4, 2026',
  gsd: '5.0 cm/px',
  shotsCount: 393,
  // 266 m ellipsoidal flight altitude; ground at the field center is about 209.5 m ellipsoidal.
  flightAltitude: '~57 m AGL at center (≈ 300 m NAVD88)',
  bounds: {
    west: -93.27553855376439,
    south: 38.784307630549215,
    east: -93.27265005724189,
    north: 38.78764669091608,
  },
  center: {
    longitude: -93.274094,
    latitude: 38.785977,
    elevation: 215, // ODM point-cloud mean, including crops and trees
  },
  // GEOID18 undulation -32.742 m, plus the 1.09 m WGS84 -> NAD83(2011) ellipsoid shift.
  navd88Offset: 33.8,
  orthophotoUrl: 'data/callis-road/callis_orthophoto.webp',
  shotsUrl: 'data/callis-road/shots.geojson',
  boundsUrl: 'data/callis-road/bounds.geojson',
}
