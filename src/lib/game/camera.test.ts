import { describe, expect, it } from 'vitest'
import { entryCameraProfile, occludedFollowDistance, streetArrivalProfile } from './camera'

describe('street-level entry camera', () => {
  it('moves from a wide arrival view to a close, low street view', () => {
    expect(entryCameraProfile(0)).toEqual({ height: 5.6, followDistance: 10.8, lookAhead: 4.8 })
    expect(entryCameraProfile(1)).toEqual({ height: 1.65, followDistance: 4.6, lookAhead: 3.15 })
  })

  it('clamps transition progress', () => {
    expect(entryCameraProfile(-1)).toEqual(entryCameraProfile(0))
    expect(entryCameraProfile(2)).toEqual(entryCameraProfile(1))
  })
})

describe('local street arrival camera', () => {
  const settled = { height: 4.2, followDistance: 6.8, lookAhead: 3.2, lookHeight: 0.95 }

  it('starts elevated and wider than the settled street frame', () => {
    expect(streetArrivalProfile(0, settled)).toEqual({ height: 8.4, followDistance: 13.4, lookAhead: 5.2, lookHeight: 0.7 })
    expect(streetArrivalProfile(1, settled)).toEqual(settled)
  })
})

describe('camera occlusion follow distance', () => {
  it('keeps the ideal distance when nothing is hit', () => {
    expect(occludedFollowDistance(5.5, undefined)).toBe(5.5)
  })

  it('pulls the camera in front of a blocking surface with clearance', () => {
    expect(occludedFollowDistance(5.5, 3.2, 0.4, 1.05)).toBeCloseTo(2.8)
  })

  it('never collapses closer than the minimum readable distance', () => {
    expect(occludedFollowDistance(5.5, 0.5, 0.4, 1.05)).toBe(1.05)
  })
})
