import { describe, expect, it } from 'vitest'
import { globalRailStops, hasCompleteGlobalRailLoop, nextGlobalRailStop } from './railway'

describe('global railway spine', () => {
  it('visits all three districts once before closing the loop', () => {
    expect(hasCompleteGlobalRailLoop()).toBe(true)
    expect(globalRailStops.map((stop) => stop.district)).toEqual(['hillside', 'harbour', 'observatory'])
    expect(nextGlobalRailStop('harbour')).toMatchObject({ nextDistrict: 'observatory', nextLink: 'TIDEWAY CAUSEWAY' })
  })

  it('rejects a rail plan that does not return to its first stop', () => {
    expect(hasCompleteGlobalRailLoop([
      { ...globalRailStops[0], nextDistrict: 'harbour' },
      { ...globalRailStops[1], nextDistrict: 'observatory' },
      { ...globalRailStops[2], nextDistrict: 'observatory' },
    ])).toBe(false)
  })
})
