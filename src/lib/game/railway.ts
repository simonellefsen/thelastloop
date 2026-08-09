import type { DistrictId } from './types'

/** A named position on the low-detail globe, ready to become a streamed seam. */
export interface GlobeCoordinate {
  latitude: number
  longitude: number
}

/**
 * The authoritative order of the Last Loop. Street scenes use their matching
 * section as a through-route; the title atlas uses the same order to draw the
 * complete little planet. Keeping this as data prevents district rails from
 * quietly turning into unrelated decorative spurs.
 */
export interface GlobalRailStop {
  district: DistrictId
  name: string
  nextDistrict: DistrictId
  nextLink: string
  coordinate: GlobeCoordinate
}

export type GlobalRailWaypointKind = 'stop' | 'waystation' | 'grove'

/**
 * Every point on the title route belongs here, rather than being recreated in
 * a renderer. The active local district can eventually stream from the same
 * identifiers and coordinates as the globe route.
 */
export interface GlobalRailWaypoint {
  id: string
  kind: GlobalRailWaypointKind
  coordinate: GlobeCoordinate
  district?: DistrictId
  color?: string
}

export const globalRailStops: readonly GlobalRailStop[] = [
  { district: 'hillside', name: 'RAVNBRO', nextDistrict: 'harbour', nextLink: 'REEDWATER VIADUCT', coordinate: { latitude: 0.74, longitude: -1.7 } },
  { district: 'harbour', name: 'HARBOUR WORKS', nextDistrict: 'observatory', nextLink: 'TIDEWAY CAUSEWAY', coordinate: { latitude: 0.94, longitude: 0.18 } },
  { district: 'observatory', name: 'MOONHILL', nextDistrict: 'hillside', nextLink: 'NIGHTFALL CUTTING', coordinate: { latitude: 0.8, longitude: 1.82 } },
]

/** Ordered, closed rail points shared by the atlas and every journey camera. */
export const globalRailRouteWaypoints: readonly GlobalRailWaypoint[] = [
  { id: 'ravnbro', kind: 'stop', district: 'hillside', coordinate: globalRailStops[0].coordinate },
  { id: 'reedwater-viaduct', kind: 'waystation', coordinate: { latitude: 1.17, longitude: -0.78 }, color: '#d4ae57' },
  { id: 'harbour-works', kind: 'stop', district: 'harbour', coordinate: globalRailStops[1].coordinate },
  { id: 'tideway-causeway', kind: 'waystation', coordinate: { latitude: 1.14, longitude: 0.94 }, color: '#5f87a2' },
  { id: 'moonhill', kind: 'stop', district: 'observatory', coordinate: globalRailStops[2].coordinate },
  { id: 'nightfall-cutting', kind: 'waystation', coordinate: { latitude: 1.28, longitude: 2.68 }, color: '#8b74aa' },
  { id: 'moon-pine-grove', kind: 'grove', coordinate: { latitude: 1.31, longitude: 2.27 } },
  { id: 'reed-grove', kind: 'grove', coordinate: { latitude: 1.22, longitude: -2.62 } },
]

export function nextGlobalRailStop(district: DistrictId): GlobalRailStop {
  const stop = globalRailStops.find((candidate) => candidate.district === district)
  if (!stop) throw new Error(`Unknown Last Loop district: ${district}`)
  return stop
}

/** The route is valid only when every district is visited once before returning home. */
export function hasCompleteGlobalRailLoop(stops: readonly GlobalRailStop[] = globalRailStops): boolean {
  if (stops.length === 0) return false
  const byDistrict = new Map(stops.map((stop) => [stop.district, stop]))
  if (byDistrict.size !== stops.length) return false
  const seen = new Set<DistrictId>()
  let district = stops[0].district
  while (!seen.has(district)) {
    seen.add(district)
    const stop = byDistrict.get(district)
    if (!stop) return false
    district = stop.nextDistrict
  }
  return district === stops[0].district && seen.size === stops.length
}

/** A route is streamable only when it contains every named town exactly once. */
export function hasFullGlobeRailCoverage(
  waypoints: readonly GlobalRailWaypoint[] = globalRailRouteWaypoints,
  stops: readonly GlobalRailStop[] = globalRailStops,
): boolean {
  const routeDistricts = waypoints
    .filter((waypoint) => waypoint.kind === 'stop')
    .map((waypoint) => waypoint.district)
  return routeDistricts.length === stops.length
    && new Set(routeDistricts).size === stops.length
    && stops.every((stop) => routeDistricts.includes(stop.district))
}
