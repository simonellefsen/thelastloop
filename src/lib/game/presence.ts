import type { PassengerIdentity } from './types'

const callsigns = ['EMBER-7', 'LANTERN-12', 'MOSS-31', 'TIDELINE-4', 'MOONBEAM-8'] as const

export function defaultPassengerIdentity(): PassengerIdentity {
  return { callsign: callsigns[0] }
}

export function nextPassengerIdentity(identity: PassengerIdentity): PassengerIdentity {
  const index = callsigns.indexOf(identity.callsign as typeof callsigns[number])
  return { callsign: callsigns[(index + 1) % callsigns.length] }
}

export function isPassengerIdentity(value: unknown): value is PassengerIdentity {
  return typeof value === 'object' && value !== null && callsigns.includes((value as PassengerIdentity).callsign as typeof callsigns[number])
}
