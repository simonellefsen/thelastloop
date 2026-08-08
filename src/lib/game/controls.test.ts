import { describe, expect, it } from 'vitest'
import { guideInput } from './controls'

const bounds = { left: 0, top: 0, width: 400, height: 800 }

describe('phone guidance input', () => {
  it('holds still at the framed player anchor', () => expect(guideInput(200, 496, bounds)).toEqual({ x: 0, y: 0 }))
  it('moves forward for a finger above the character', () => expect(guideInput(200, 160, bounds).y).toBeGreaterThan(0.9))
  it('moves right for a finger to the right of the character', () => expect(guideInput(390, 496, bounds).x).toBeGreaterThan(0.9))
  it('keeps guidance within the controller range', () => expect(Math.hypot(...Object.values(guideInput(900, -100, bounds)))).toBeLessThanOrEqual(1))
})
