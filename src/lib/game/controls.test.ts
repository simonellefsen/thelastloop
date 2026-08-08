import { describe, expect, it } from 'vitest'
import { guideInput, objectiveDirection } from './controls'

const bounds = { left: 0, top: 0, width: 400, height: 800 }

describe('phone guidance input', () => {
  it('holds still at the framed player anchor', () => expect(guideInput(200, 496, bounds)).toEqual({ x: 0, y: 0 }))
  it('moves forward for a finger above the character', () => expect(guideInput(200, 160, bounds).y).toBeGreaterThan(0.9))
  it('moves right for a finger to the right of the character', () => expect(guideInput(390, 496, bounds).x).toBeGreaterThan(0.9))
  it('keeps guidance within the controller range', () => expect(Math.hypot(...Object.values(guideInput(900, -100, bounds)))).toBeLessThanOrEqual(1))
})

describe('objective route bearing', () => {
  const forward = { x: 0, z: -1 }
  const player = { x: 0, z: 0 }

  it('uses compact relative directions for a nearby objective', () => {
    expect(objectiveDirection(forward, player, { x: 0, z: -5 })).toBe('ahead')
    expect(objectiveDirection(forward, player, { x: 5, z: -5 })).toBe('ahead-right')
    expect(objectiveDirection(forward, player, { x: -5, z: 0 })).toBe('left')
  })

  it('reports an objective in interaction range as here', () => {
    expect(objectiveDirection(forward, player, { x: 0.7, z: -0.5 })).toBe('here')
  })
})
