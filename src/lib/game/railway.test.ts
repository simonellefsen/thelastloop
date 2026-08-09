import { describe, expect, it } from 'vitest'
import { globalRailRouteWaypoints, globalRailStops, hasCompleteGlobalRailLoop, hasFullGlobeRailCoverage, nextGlobalRailStop } from './railway'

describe('global railway spine', () => {
  it('visits all three districts once before closing the loop', () => {
    expect(hasCompleteGlobalRailLoop()).toBe(true)
    expect(globalRailStops.map((stop) => stop.district)).toEqual(['hillside', 'harbour', 'observatory'])
    expect(nextGlobalRailStop('harbour')).toMatchObject({ nextDistrict: 'observatory', nextLink: 'TIDEWAY CAUSEWAY' })
    expect(nextGlobalRailStop('observatory')).toMatchObject({ nextDistrict: 'hillside', nextLink: 'NIGHTFALL CUTTING' })
  })

  it('rejects a rail plan that does not return to its first stop', () => {
    expect(hasCompleteGlobalRailLoop([
      { ...globalRailStops[0], nextDistrict: 'harbour' },
      { ...globalRailStops[1], nextDistrict: 'observatory' },
      { ...globalRailStops[2], nextDistrict: 'observatory' },
    ])).toBe(false)
  })

  it('keeps the complete atlas path in the same contract as the stop order', () => {
    expect(hasFullGlobeRailCoverage()).toBe(true)
    expect(globalRailRouteWaypoints.map((waypoint) => waypoint.id)).toEqual([
      'ravnbro', 'reedwater-viaduct', 'harbour-works', 'tideway-causeway',
      'moonhill', 'nightfall-cutting', 'moon-pine-grove', 'reed-grove',
    ])
    expect(globalRailStops[0].coordinate).toEqual({ latitude: 0.74, longitude: -1.7 })
  })
})
