import { describe, expect, it } from 'vitest'
import { restorationLightProfile } from './restoration'

describe('district restoration lighting', () => {
  it('keeps unfinished route hardware visibly subdued', () => {
    expect(restorationLightProfile('harbour', 'second').intensity).toBeLessThan(0.2)
    expect(restorationLightProfile('observatory', 'first').intensity).toBeLessThan(0.2)
  })

  it('gives each completed district a distinct, brighter restoration state', () => {
    const harbour = restorationLightProfile('harbour', 'complete')
    const moonhill = restorationLightProfile('observatory', 'complete')

    expect(harbour.intensity).toBeGreaterThan(0.8)
    expect(moonhill.intensity).toBeGreaterThan(0.8)
    expect(harbour.emissive).not.toBe(moonhill.emissive)
  })
})
