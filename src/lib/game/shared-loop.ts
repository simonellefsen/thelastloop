import type { PassengerIdentity, RoomDirectoryEntry } from './types'

export const SHARED_LOOP_PROTOCOL = 1
export type PresencePosition = [number, number, number]

export interface HelloMessage {
  type: 'hello'
  protocol: typeof SHARED_LOOP_PROTOCOL
  identity: PassengerIdentity
  roomId: string
}

export interface MoveMessage {
  type: 'move'
  position: PresencePosition
  sequence: number
}

export interface LeaveMessage {
  type: 'leave'
}

export type SharedLoopClientMessage = HelloMessage | MoveMessage | LeaveMessage

export interface RemotePassenger {
  id: string
  identity: PassengerIdentity
  position: PresencePosition
}

export interface WelcomeMessage {
  type: 'welcome'
  selfId: string
  passengers: RemotePassenger[]
}

export interface DirectoryMessage {
  type: 'directory'
  rooms: RoomDirectoryEntry[]
}

export type SharedLoopServerMessage = WelcomeMessage | DirectoryMessage

export function interpolatePresence(from: PresencePosition, to: PresencePosition, amount: number): PresencePosition {
  const clamped = Math.min(1, Math.max(0, amount))
  return [from[0] + (to[0] - from[0]) * clamped, from[1] + (to[1] - from[1]) * clamped, from[2] + (to[2] - from[2]) * clamped]
}

export function isSharedLoopClientMessage(value: unknown): value is SharedLoopClientMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  if (value.type === 'leave') return true
  if (value.type === 'hello') return value.protocol === SHARED_LOOP_PROTOCOL && typeof value.roomId === 'string' && isIdentity(value.identity)
  return value.type === 'move' && isPosition(value.position) && typeof value.sequence === 'number' && Number.isInteger(value.sequence) && value.sequence >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isIdentity(value: unknown): value is PassengerIdentity {
  return isRecord(value) && typeof value.callsign === 'string'
}

function isPosition(value: unknown): value is PresencePosition {
  return Array.isArray(value) && value.length === 3 && value.every((component) => typeof component === 'number' && Number.isFinite(component))
}
