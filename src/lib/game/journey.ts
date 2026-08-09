import type { DistrictId, RailJourney, RailJourneyPhase } from './types'

export const RAIL_JOURNEY_SECONDS = 4.2
export const REDUCED_MOTION_RAIL_JOURNEY_SECONDS = 1.1
export const ATLAS_JOURNEY_PORTION = 0.46

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

/** The title's train and the ride transition share a single ordered route around the planet. */
export function railAtlasProgress(from: DistrictId, to: DistrictId, progress: number): number {
  const route: Record<`${DistrictId}:${DistrictId}`, readonly [number, number]> = {
    'hillside:harbour': [0, 0.25],
    'hillside:observatory': [0, 0.5],
    'harbour:hillside': [0.25, 0],
    'observatory:hillside': [0.5, 1],
    'harbour:observatory': [0.25, 0.5],
    'observatory:harbour': [0.5, 0.25],
    'hillside:hillside': [0, 0],
    'harbour:harbour': [0.25, 0.25],
    'observatory:observatory': [0.5, 0.5],
  }
  const [start, end] = route[`${from}:${to}`]
  return (start + (end - start) * Math.min(1, Math.max(0, progress))) % 1
}

/**
 * The map travels the entire route while the globe is visible, then holds at
 * the destination while the camera makes its close approach to the platform.
 */
export function journeyAtlasProgress(from: DistrictId, to: DistrictId, progress: number): number {
  return railAtlasProgress(from, to, Math.min(1, Math.max(0, progress / ATLAS_JOURNEY_PORTION)))
}

export function railJourneyPhase(progress: number): RailJourneyPhase {
  return progress < ATLAS_JOURNEY_PORTION ? 'atlas' : 'approach'
}

export function createRailJourney(from: DistrictId, to: DistrictId, elapsed: number, duration: number): RailJourney {
  const progress = railJourneyProgress(elapsed, duration)
  return {
    from,
    to,
    progress,
    atlasProgress: journeyAtlasProgress(from, to, progress),
    label: railJourneyLabel(from, to),
    phase: railJourneyPhase(progress),
  }
}
