/**
 * World scale contract — the numbers that keep the street camera out of the roofs.
 *
 * Before M0 the town was built at doll-house scale: house eaves stopped at 1.90 m
 * against a 1.76 m character — barely above head height — and the ridge reached only
 * 2.72 m (1.5x). The street camera therefore had to sit at 3.25 m to see a town at all,
 * which is 1.35 m *above* the eaves: every building it passed put a roof plane into the
 * near frustum and hid the player. Messenger's buildings are 4–8x its character, which
 * is what lets its camera sit low inside a street canyon.
 *
 * Camera height and building height are therefore one constraint, expressed here so
 * `camera.test.ts` can assert it and `tools/blender/export_ravnbro_kits.py` can mirror it.
 * Keep the Python constants in sync — they are duplicated there by necessity, not choice.
 */

/** Standing height of the player/NPC kit, measured from the exported `char-player.glb`. */
export const CHARACTER_HEIGHT = 1.76

/** Visible base course every frontage kit stands on. */
export const PLINTH_HEIGHT = 0.18

/** One floor of a street frontage. ~1.47x the character, matching real storey proportion. */
export const STOREY_HEIGHT = 2.2

/** Street frontages are two storeys unless a kit asks for more. */
export const DEFAULT_STOREYS = 2

/** Ridge rise above the eaves on a gable roof. Steeper than the old 0.82 m so a
 * low street camera reads a roof, not a slab. */
export const ROOF_RISE = 1.05

/**
 * Street-frontage / lot-depth ratio above which the ridge must run along the
 * street. A wide span sloping to a short ridge is what made the station wing
 * read as a flat slab (M0.10). Typical houses sit below this and keep a gable
 * facing the road.
 */
export const LONG_ROOF_ASPECT = 1.45

export function roofRidgesAlongStreet(frontage: number, depth: number): boolean {
  return frontage / Math.max(depth, 0.01) >= LONG_ROOF_ASPECT
}

/** Height of the eave line — where the wall stops and the roof begins. */
export function houseEavesHeight(storeys: number = DEFAULT_STOREYS): number {
  return PLINTH_HEIGHT + STOREY_HEIGHT * storeys
}

/** Height of the roof ridge. */
export function houseRidgeHeight(storeys: number = DEFAULT_STOREYS): number {
  return houseEavesHeight(storeys) + ROOF_RISE
}

/** Lowest eave line a street camera may have to pass beneath. */
export const MIN_STREET_EAVES = houseEavesHeight(DEFAULT_STOREYS)

/**
 * Vertical gap the camera keeps below the lowest eave. Large on purpose — clearing the
 * eave by a hair still frames a wall of roof. This gap is what puts the rig *in* the
 * street canyon rather than skimming its ceiling, and it leaves room for the pitch,
 * the follow spring, and M0.3's sphere-cast radius.
 */
export const STREET_CAMERA_EAVE_CLEARANCE = 2.4

/**
 * Hard ceiling for any settled street camera height (2.18 m against 4.58 m eaves).
 * Enforced by `camera.test.ts` — if a district profile needs to exceed this, raise that
 * district's frontage instead of lifting the camera back into the roofs.
 */
export const MAX_STREET_CAMERA_HEIGHT = MIN_STREET_EAVES - STREET_CAMERA_EAVE_CLEARANCE

/**
 * Clear paved width the follow camera needs. The Ravnbro hero road is 4.2 m;
 * the rig sits 4.25–4.4 m behind the player with a 0.42 m probe bundle. A
 * narrower pocket puts flanking eaves into the near frustum.
 */
export const MIN_STREET_CORRIDOR_WIDTH = 4.2
