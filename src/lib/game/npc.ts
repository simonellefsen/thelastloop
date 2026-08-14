import { Mesh, type Material, type Object3D } from 'three'

/** Collision radius around a standing street NPC. Talk range stays larger. */
export const STREET_NPC_RADIUS = 0.48

/** Distance at which a street NPC becomes the nearby interact target. */
export const STREET_NPC_INTERACT_RADIUS = 1.85

/** Station keeper stays a little friendlier than the other two. */
export const HILLSIDE_KEEPER_INTERACT_RADIUS = 2

/**
 * Off the hero-corridor centreline so the start camera does not look through
 * the keeper at the player. Still inside the talk radius from the road.
 */
export const HILLSIDE_KEEPER_POSITION = { x: 1.72, z: 2.35 }
export const HARBOUR_KEEPER_POSITION = { x: -0.9, z: -6.35 }
export const MOON_WARDEN_POSITION = { x: -2.55, z: -1.5 }

/** Cylinder radius around the camera→player segment that ghosts an NPC. */
export const CHARACTER_OCCLUDE_RADIUS = 0.48
export const CHARACTER_OCCLUDE_MIN_OPACITY = 0.16

/** How opaque an NPC should stay when the camera looks through them at the player. */
export function characterOcclusionOpacity(
  camera: { x: number; y: number; z: number },
  player: { x: number; y: number; z: number },
  npc: { x: number; y: number; z: number },
  radius = CHARACTER_OCCLUDE_RADIUS,
): number {
  const ax = player.x - camera.x
  const ay = player.y - camera.y
  const az = player.z - camera.z
  const lengthSq = ax * ax + ay * ay + az * az
  if (lengthSq < 1e-6) return 1
  const t = ((npc.x - camera.x) * ax + (npc.y - camera.y) * ay + (npc.z - camera.z) * az) / lengthSq
  if (t <= 0.06 || t >= 0.94) return 1
  const closestX = camera.x + ax * t
  const closestY = camera.y + ay * t
  const closestZ = camera.z + az * t
  const distance = Math.hypot(npc.x - closestX, npc.y - closestY, npc.z - closestZ)
  if (distance >= radius) return 1
  return 1 - (1 - distance / radius) * (1 - CHARACTER_OCCLUDE_MIN_OPACITY)
}

/** Talk range must always reach past the body so a blocker cannot lock a quest. */
export function npcTalkClearance(interactRadius: number, collisionRadius = STREET_NPC_RADIUS): number {
  return interactRadius - collisionRadius
}

/** Fade a character's unique materials. Shared outline shells hide instead of fading. */
export function setCharacterOpacity(root: Object3D, opacity: number, outlineMaterial: Material): void {
  const faded = opacity < 0.999
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    if (mesh.material === outlineMaterial) {
      mesh.visible = opacity > 0.55
      return
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (!material || !('opacity' in material)) continue
      const next = material as Material & { opacity: number; transparent: boolean; depthWrite: boolean }
      next.transparent = faded
      next.opacity = opacity
      next.depthWrite = !faded
    }
  })
}
