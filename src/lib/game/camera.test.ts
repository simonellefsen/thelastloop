import { describe, expect, it } from 'vitest'
import {
  STREET_ARRIVAL_HEIGHT,
  entryCameraProfile,
  occludedFollowDistance,
  streetArrivalProfile,
  streetCameraProfiles,
} from './camera'
import { MAX_STREET_CAMERA_HEIGHT, MIN_STREET_EAVES, houseEavesHeight } from './kit/scale'

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
  const settled = { height: 2.05, followDistance: 4.4, lookAhead: 2.45, lookHeight: 0.95 }

  it('starts elevated and wider than the settled street frame', () => {
    const arrival = streetArrivalProfile(0, settled)
    expect(arrival.height).toBe(STREET_ARRIVAL_HEIGHT)
    expect(arrival.height).toBeGreaterThan(settled.height)
    expect(arrival.followDistance).toBeGreaterThan(settled.followDistance)
    expect(streetArrivalProfile(1, settled)).toEqual(settled)
  })

  it('never lifts the arrival move above the rooflines it flies past', () => {
    // The old 8.4 m opening dragged the descent straight through the roof band.
    for (let step = 0; step <= 10; step += 1) {
      expect(streetArrivalProfile(step / 10, settled).height).toBeLessThan(MIN_STREET_EAVES)
    }
  })
})

/**
 * M0 invariant. The reported bug was the street camera flying 1.35 m above the eaves,
 * putting a roof plane in the near frustum and hiding the player. Building height and
 * camera height are one constraint — these tests are what stop them drifting apart.
 */
describe('street camera stays under the frontage eaves', () => {
  it('keeps every district rig below the eave ceiling', () => {
    for (const [district, profile] of Object.entries(streetCameraProfiles)) {
      expect(profile.height, `${district} rig height`).toBeLessThanOrEqual(MAX_STREET_CAMERA_HEIGHT)
      expect(profile.height, `${district} rig height`).toBeLessThan(MIN_STREET_EAVES)
    }
  })

  it('leaves real clearance rather than skimming the eave line', () => {
    for (const [district, profile] of Object.entries(streetCameraProfiles)) {
      expect(MIN_STREET_EAVES - profile.height, `${district} clearance`).toBeGreaterThan(2)
    }
  })

  it('holds the frontage tall enough for the rig to sit beneath it', () => {
    // Pre-M0 the default house reached 1.90 m at the eaves against a ~1.5 m character.
    expect(houseEavesHeight()).toBeCloseTo(4.58)
    expect(houseEavesHeight()).toBeGreaterThan(1.9 * 2)
  })

  it('frames the player from a low rig, not a survey height', () => {
    for (const [district, profile] of Object.entries(streetCameraProfiles)) {
      // Camera barely above head height, close enough that the avatar reads.
      expect(profile.height, `${district} rig height`).toBeLessThan(2.4)
      expect(profile.followDistance, `${district} follow`).toBeLessThan(5)
    }
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
