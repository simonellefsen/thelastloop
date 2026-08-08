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
 * The anchor sits where the third-person character is framed, below centre. */
export function guideInput(clientX: number, clientY: number, bounds: ScreenBounds): { x: number; y: number } {
  const x = (clientX - bounds.left) / bounds.width - 0.5
  const y = 0.62 - (clientY - bounds.top) / bounds.height
  const distance = Math.hypot(x, y)
  const deadZone = 0.035
  if (distance <= deadZone) return { x: 0, y: 0 }
  const strength = Math.min(1, (distance - deadZone) / 0.28)
  return { x: x / distance * strength, y: y / distance * strength }
}
