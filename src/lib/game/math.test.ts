import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { gentleStreetHeight, isOutsideSphericalBlockers, isWithinWalkableCap, projectToSphere, tangentForward } from './math'

describe('spherical traversal helpers', () => {
  it('projects points to the requested radius', () => expect(projectToSphere(new Vector3(2, 3, 4), 9).length()).toBeCloseTo(9))
  it('rejects points outside the walkable cap', () => expect(isWithinWalkableCap(new Vector3(1, 0, 0), new Vector3(0, 1, 0), 0.4)).toBe(false))
  it('rejects movement into a spherical blocker while allowing its edge', () => {
    const blockers = [{ normal: new Vector3(0, 1, 0), radius: 0.25 }]
    expect(isOutsideSphericalBlockers(new Vector3(0, 1, 0), blockers)).toBe(false)
    expect(isOutsideSphericalBlockers(new Vector3(1, 1, 0), blockers)).toBe(true)
  })
  it('keeps the street gently curved without becoming a steep slope', () => {
    expect(gentleStreetHeight(0, 0)).toBeCloseTo(0)
    expect(gentleStreetHeight(12, 0)).toBeLessThan(-0.25)
    expect(gentleStreetHeight(12, 0)).toBeGreaterThan(-0.7)
  })
  it('returns a forward vector on the ground plane', () => expect(tangentForward(new Vector3(0, 1, 0), new Vector3(0, 1, 0)).dot(new Vector3(0, 1, 0))).toBeCloseTo(0))
})
