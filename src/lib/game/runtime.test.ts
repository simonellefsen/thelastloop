import { describe, expect, it } from 'vitest'
import { animationTime, shouldRender } from './runtime'

describe('renderer runtime policy', () => {
  it('renders only visible documents', () => {
    expect(shouldRender('visible')).toBe(true)
    expect(shouldRender('hidden')).toBe(false)
  })

  it('freezes decorative motion when reduced motion is requested', () => {
    expect(animationTime(12.4, true)).toBe(0)
    expect(animationTime(12.4, false)).toBe(12.4)
  })
})
