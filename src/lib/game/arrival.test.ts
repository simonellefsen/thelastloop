import { describe, expect, it } from 'vitest'
import { arrivalCopy } from './arrival'

describe('district arrival copy', () => {
  it('gives each playable district a distinct route card', () => {
    expect(arrivalCopy.hillside.place).toBe('RAVNBRO')
    expect(arrivalCopy.harbour.route).toBe('LOW TIDE LINE')
    expect(arrivalCopy.observatory.copy).toContain('telescope')
  })
})
