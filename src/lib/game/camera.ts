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

/**
 * Settled street rigs, one per district.
 *
 * These sit **below the frontage eaves** (see `kit/scale.ts`). Before M0 they were at
 * 3.1–3.25 m against 1.90 m eaves, so the camera flew at roof altitude and every
 * building it passed hid the player behind a roof plane. `camera.test.ts` enforces the
 * ceiling — if a district needs a higher rig, raise that district's frontage instead.
 */
export const streetCameraProfiles: Record<'hillside' | 'harbour' | 'observatory', StreetCameraProfile> = {
  hillside: { height: 2.05, followDistance: 4.4, lookAhead: 2.45, lookHeight: 0.95 },
  harbour: { height: 2.0, followDistance: 4.25, lookAhead: 2.4, lookHeight: 0.94 },
  observatory: { height: 2.1, followDistance: 4.35, lookAhead: 2.5, lookHeight: 0.98 },
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

/**
 * Opening height of the district arrival move.
 *
 * This used to be 8.4 m — well above the rooftops — so the ease-down dragged the camera
 * straight through the roof band and filled the frame with roof planes on the way in.
 * The arrival now starts inside the street canyon: still elevated relative to the
 * settled rig, but never above the eaves.
 */
export const STREET_ARRIVAL_HEIGHT = 4.05

/** A brief elevated arrival settles into the upright, locally-flat district camera. */
export function streetArrivalProfile(progress: number, settled: StreetCameraProfile): StreetCameraProfile {
  const clamped = Math.min(1, Math.max(0, progress))
  const eased = 1 - (1 - clamped) ** 3
  return {
    height: STREET_ARRIVAL_HEIGHT + (settled.height - STREET_ARRIVAL_HEIGHT) * eased,
    followDistance: 8.6 + (settled.followDistance - 8.6) * eased,
    lookAhead: 3.6 + (settled.lookAhead - 3.6) * eased,
    lookHeight: 0.7 + (settled.lookHeight - 0.7) * eased,
  }
}

/**
 * Closest the occlusion guard may pull the rig toward the player.
 *
 * This was 1.05 m, which let the recovery create the very frame it exists to
 * prevent: at a metre from a 1.76 m character the avatar fills the screen, and
 * the 0.1 m near plane sits inside whatever the camera has backed into. Keeping
 * a couple of metres means a blocked camera still frames a person.
 */
export const MIN_FOLLOW_DISTANCE = 2.2

/**
 * When scenery sits between the player and the ideal third-person rig, pull the
 * follow distance in so the avatar stays on screen instead of vanishing behind roofs.
 */
export function occludedFollowDistance(
  idealDistance: number,
  hitDistance: number | undefined,
  clearance = 0.4,
  minDistance = MIN_FOLLOW_DISTANCE,
): number {
  if (hitDistance === undefined || !Number.isFinite(hitDistance)) return idealDistance
  return Math.max(minDistance, Math.min(idealDistance, hitDistance - clearance))
}
