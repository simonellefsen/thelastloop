import { describe, expect, it } from 'vitest'
import { entryCameraProfile } from './camera'

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
