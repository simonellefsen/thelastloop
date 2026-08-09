import { Vector3 } from 'three'

export interface SphericalBlocker {
  normal: Vector3
  radius: number
}

/** A local-world blocker uses the walkable X/Z plane; terrain height is irrelevant. */
export interface StreetBlocker {
  center: Vector3
  radius: number
}

export function projectToSphere(point: Vector3, radius: number): Vector3 {
  return point.clone().normalize().multiplyScalar(radius)
}

export function isWithinWalkableCap(point: Vector3, anchor: Vector3, maximumAngle: number): boolean {
  return point.clone().normalize().angleTo(anchor.clone().normalize()) <= maximumAngle
}

export function isOutsideSphericalBlockers(point: Vector3, blockers: readonly SphericalBlocker[]): boolean {
  const normal = point.clone().normalize()
  return blockers.every((blocker) => normal.angleTo(blocker.normal) > blocker.radius)
}

/**
 * Shared collision check for the three locally flat districts. Keeping it out
 * of the renderer makes a building, cart or edge post obey the same movement
 * rule everywhere, even where the terrain's visual height changes.
 */
export function isOutsideStreetBlockers(point: Vector3, blockers: readonly StreetBlocker[]): boolean {
  return blockers.every((blocker) => Math.hypot(point.x - blocker.center.x, point.z - blocker.center.z) > blocker.radius)
}

export function gentleStreetHeight(x: number, z: number): number {
  return -0.003 * (x * x + z * z) + Math.sin(x * 0.24) * Math.cos(z * 0.2) * 0.11
}

export function tangentForward(forward: Vector3, surfaceNormal: Vector3): Vector3 {
  const tangent = forward.clone().addScaledVector(surfaceNormal, -forward.dot(surfaceNormal))
  return tangent.lengthSq() < 0.0001 ? new Vector3(1, 0, 0).cross(surfaceNormal).normalize() : tangent.normalize()
}
