export interface EntryCameraProfile {
  height: number
  followDistance: number
  lookAhead: number
}

export interface StreetCameraProfile {
  height: number
  followDistance: number
  lookAhead: number
  lookHeight: number
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

/** A brief high arrival settles into the upright, locally-flat district camera. */
export function streetArrivalProfile(progress: number, settled: StreetCameraProfile): StreetCameraProfile {
  const clamped = Math.min(1, Math.max(0, progress))
  const eased = 1 - (1 - clamped) ** 3
  return {
    height: 8.4 + (settled.height - 8.4) * eased,
    followDistance: 13.4 + (settled.followDistance - 13.4) * eased,
    lookAhead: 5.2 + (settled.lookAhead - 5.2) * eased,
    lookHeight: 0.7 + (settled.lookHeight - 0.7) * eased,
  }
}
