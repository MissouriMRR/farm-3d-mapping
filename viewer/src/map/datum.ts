/**
 * Heights in the viewer stay in the WGS84 ellipsoidal frame that ODM, Cesium World Terrain and
 * Cesium positions share, so layers line up without any vertical offset. Convert only when a
 * height is shown to a person, and always name the datum.
 *
 * NAVD88 height = ellipsoidal height + offset, where the offset is the negated GEOID18 undulation
 * plus the WGS84 -> NAD83(2011) ellipsoid shift. Over one field the offset varies by millimetres,
 * so each field carries a single constant.
 */
export function ellipsoidalToNavd88(ellipsoidalHeight: number, navd88Offset: number): number {
  return ellipsoidalHeight + navd88Offset
}

/** Whole metres: the survey has no ground control, so finer digits would overstate accuracy. */
export function formatNavd88(ellipsoidalHeight: number, navd88Offset: number): string {
  return `${Math.round(ellipsoidalToNavd88(ellipsoidalHeight, navd88Offset))} m NAVD88`
}

export function formatEllipsoidal(ellipsoidalHeight: number): string {
  return `${ellipsoidalHeight.toFixed(1)} m WGS84 ellipsoid`
}
