import type { DistrictId, RailJourney } from './types'

export const RAIL_JOURNEY_SECONDS = 4.2
export const REDUCED_MOTION_RAIL_JOURNEY_SECONDS = 1.1

export function railJourneyProgress(elapsed: number, duration: number): number {
  if (duration <= 0) return 1
  return Math.min(1, Math.max(0, elapsed / duration))
}

export function railJourneyLabel(from: DistrictId, to: DistrictId): string {
  if (from === 'hillside' && to === 'harbour') return 'REEDWATER VIADUCT'
  if (from === 'hillside' && to === 'observatory') return 'NIGHTFALL CUTTING'
  if (from === 'harbour' && to === 'hillside') return 'REEDWATER RETURN'
  if (from === 'observatory' && to === 'hillside') return 'NIGHTFALL RETURN'
  return 'THE LAST LOOP'
}

export function createRailJourney(from: DistrictId, to: DistrictId, elapsed: number, duration: number): RailJourney {
  return { from, to, progress: railJourneyProgress(elapsed, duration), label: railJourneyLabel(from, to) }
}
