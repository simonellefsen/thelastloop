export interface ScreenBounds {
  left: number
  top: number
  width: number
  height: number
}

export type ObjectiveDirection = 'ahead' | 'ahead-right' | 'right' | 'behind-right' | 'behind' | 'behind-left' | 'left' | 'ahead-left' | 'here'

/** Converts a local target vector into a compact player-relative route cue. */
export function objectiveDirection(forward: { x: number; z: number }, from: { x: number; z: number }, target: { x: number; z: number }): ObjectiveDirection {
  const offsetX = target.x - from.x
  const offsetZ = target.z - from.z
  const distance = Math.hypot(offsetX, offsetZ)
  if (distance < 1.15) return 'here'
  const facingLength = Math.hypot(forward.x, forward.z) || 1
  const dot = (forward.x * offsetX + forward.z * offsetZ) / (facingLength * distance)
  const cross = (forward.x * offsetZ - forward.z * offsetX) / (facingLength * distance)
  const angle = Math.atan2(cross, dot)
  const index = (Math.round(angle / (Math.PI / 4)) + 8) % 8
  return ['ahead', 'ahead-right', 'right', 'behind-right', 'behind', 'behind-left', 'left', 'ahead-left'][index] as ObjectiveDirection
}

/** Maps a held screen position into a phone-friendly world direction.
 * The anchor sits where the third-person character is framed, below centre.
 * The analog window is wide so a small finger move on a portrait phone still
 * walks at a usable speed (Messenger-like: hold anywhere, walk that way). */
export function guideInput(clientX: number, clientY: number, bounds: ScreenBounds): { x: number; y: number } {
  const x = (clientX - bounds.left) / bounds.width - 0.5
  const y = 0.62 - (clientY - bounds.top) / bounds.height
  const distance = Math.hypot(x, y)
  const deadZone = 0.028
  if (distance <= deadZone) return { x: 0, y: 0 }
  const strength = Math.min(1, (distance - deadZone) / 0.22)
  return { x: x / distance * strength, y: y / distance * strength }
}

/**
 * Translates touch/keyboard input into the current street-camera basis. This
 * keeps "right" under the player's finger even while the third-person camera
 * eases around a corner.
 */
export function screenRelativeStreetDirection(input: { x: number; y: number }, cameraForward: { x: number; z: number }): { x: number; z: number } {
  const forwardLength = Math.hypot(cameraForward.x, cameraForward.z) || 1
  const forwardX = cameraForward.x / forwardLength
  const forwardZ = cameraForward.z / forwardLength
  const x = forwardX * input.y - forwardZ * input.x
  const z = forwardZ * input.y + forwardX * input.x
  const length = Math.hypot(x, z)
  return length > 1 ? { x: x / length, z: z / length } : { x, z }
}

/** Turns a guidance vector into the rotation for an upright touch arrow.
 * Zero degrees points forward, matching the character's screen-facing direction. */
export function guidanceRotation(input: { x: number; y: number }): number {
  if (Math.hypot(input.x, input.y) < 0.001) return 0
  return Math.atan2(input.x, input.y) * (180 / Math.PI)
}
