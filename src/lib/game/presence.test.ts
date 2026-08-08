import { describe, expect, it } from 'vitest'
import { defaultPassengerIdentity, isPassengerIdentity, nextPassengerIdentity } from './presence'

describe('local passenger identity', () => {
  it('uses a non-identifying default callsign and cycles predictably', () => {
    expect(defaultPassengerIdentity()).toEqual({ callsign: 'EMBER-7' })
    expect(nextPassengerIdentity({ callsign: 'EMBER-7' })).toEqual({ callsign: 'LANTERN-12' })
  })

  it('accepts only the project callsign set', () => {
    expect(isPassengerIdentity({ callsign: 'MOSS-31' })).toBe(true)
    expect(isPassengerIdentity({ callsign: 'Ada' })).toBe(false)
  })
})
