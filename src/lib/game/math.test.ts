import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { isWithinWalkableCap, projectToSphere, tangentForward } from './math'

describe('spherical traversal helpers', () => {
  it('projects points to the requested radius', () => expect(projectToSphere(new Vector3(2, 3, 4), 9).length()).toBeCloseTo(9))
  it('rejects points outside the walkable cap', () => expect(isWithinWalkableCap(new Vector3(1, 0, 0), new Vector3(0, 1, 0), 0.4)).toBe(false))
  it('returns a forward vector on the ground plane', () => expect(tangentForward(new Vector3(0, 1, 0), new Vector3(0, 1, 0)).dot(new Vector3(0, 1, 0))).toBeCloseTo(0))
})
