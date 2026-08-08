export interface ScreenBounds {
  left: number
  top: number
  width: number
  height: number
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
