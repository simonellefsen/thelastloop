import type { SideQuestStage } from './types'

export type RestorationDistrict = 'harbour' | 'observatory'

export interface RestorationLightProfile {
  color: string
  emissive: string
  intensity: number
}

/**
 * A completed district should change the street itself, not only its quest
 * ledger. These small emissive profiles keep that payoff legible without
 * adding dynamic lights or post-processing on mobile.
 */
export const restorationLightProfile = (
  district: RestorationDistrict,
  stage: SideQuestStage,
): RestorationLightProfile => {
  const restored = stage === 'complete'
  if (district === 'harbour') {
    return restored
      ? { color: '#79d9b2', emissive: '#2b9175', intensity: 0.92 }
      : { color: '#537787', emissive: '#285664', intensity: 0.14 }
  }
  return restored
    ? { color: '#b8ead6', emissive: '#5786a9', intensity: 0.96 }
    : { color: '#75699c', emissive: '#41376c', intensity: 0.14 }
}
