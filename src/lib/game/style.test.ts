import { describe, expect, it } from 'vitest'
import { nextCoatColor } from './style'

describe('coat customisation', () => {
  it('cycles through every original coat colour', () => {
    expect(nextCoatColor('gold')).toBe('berry')
    expect(nextCoatColor('berry')).toBe('ocean')
    expect(nextCoatColor('ocean')).toBe('gold')
  })
})
