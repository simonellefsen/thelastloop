import type { DistrictId } from './types'

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
  titleLatitude: number
  titleLongitude: number
}

export const globalRailStops: readonly GlobalRailStop[] = [
  { district: 'hillside', name: 'RAVNBRO', nextDistrict: 'harbour', nextLink: 'REEDWATER VIADUCT', titleLatitude: 0.74, titleLongitude: -1.7 },
  { district: 'harbour', name: 'HARBOUR WORKS', nextDistrict: 'observatory', nextLink: 'TIDEWAY CAUSEWAY', titleLatitude: 0.94, titleLongitude: 0.18 },
  { district: 'observatory', name: 'MOONHILL', nextDistrict: 'hillside', nextLink: 'NIGHTFALL CUTTING', titleLatitude: 0.8, titleLongitude: 1.82 },
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
