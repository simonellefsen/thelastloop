import { Vector3 } from 'three'

export function projectToSphere(point: Vector3, radius: number): Vector3 {
  return point.clone().normalize().multiplyScalar(radius)
}

export function isWithinWalkableCap(point: Vector3, anchor: Vector3, maximumAngle: number): boolean {
  return point.clone().normalize().angleTo(anchor.clone().normalize()) <= maximumAngle
}

export function tangentForward(forward: Vector3, surfaceNormal: Vector3): Vector3 {
  const tangent = forward.clone().addScaledVector(surfaceNormal, -forward.dot(surfaceNormal))
  return tangent.lengthSq() < 0.0001 ? new Vector3(1, 0, 0).cross(surfaceNormal).normalize() : tangent.normalize()
}
