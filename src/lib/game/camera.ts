export interface EntryCameraProfile {
  height: number
  followDistance: number
  lookAhead: number
}

export function entryCameraProfile(progress: number): EntryCameraProfile {
  const clamped = Math.min(1, Math.max(0, progress))
  const eased = 1 - (1 - clamped) ** 3
  return {
    height: 5.6 + (1.65 - 5.6) * eased,
    followDistance: 10.8 + (4.6 - 10.8) * eased,
    lookAhead: 4.8 + (3.15 - 4.8) * eased,
  }
}
