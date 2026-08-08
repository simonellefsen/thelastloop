export type ClueId = 'signal' | 'mural' | 'bell'
export type CoatColor = 'gold' | 'berry' | 'ocean'
export type DistrictId = 'hillside' | 'harbour' | 'observatory'
export type SideQuestId = 'lantern' | 'chorus' | 'harbour' | 'observatory'
export type SideQuestStage = 'locked' | 'first' | 'second' | 'complete'

export interface PassengerIdentity {
  callsign: string
}

export interface RoomDirectoryEntry {
  id: string
  label: string
  occupancy: number
  capacity: number
  localOnly: boolean
}

export interface QuestState {
  introductionSeen: boolean
  completedClues: ClueId[]
  stationNameRestored: boolean
  lantern: SideQuestStage
  chorus: SideQuestStage
  harbour: SideQuestStage
  observatory: SideQuestStage
}

export interface GameSave {
  version: 5
  soundEnabled: boolean
  reducedMotion: boolean
  coatColor: CoatColor
  identity: PassengerIdentity
  district: DistrictId
  playerNormal: [number, number, number]
  quest: QuestState
}

export interface WorldInteractable {
  id: 'station-keeper' | 'station-door' | 'harbour-keeper' | 'moon-warden' | ClueId | 'lens-cache' | 'signal-repair' | 'tune-card' | 'bell-chime' | 'harbour-valve' | 'harbour-pump' | 'observatory-lens' | 'observatory-scope'
  label: string
  position: [number, number, number]
}

export interface PlayerController {
  setJoystick(input: { x: number; y: number }): void
  interact(): void
  toggleReducedMotion(): void
  leaveStation(): void
  cycleCoat(): void
  cyclePassengerIdentity(): void
  setTitlePreview(district: DistrictId): void
  travelToHarbour(): void
  travelToObservatory(): void
  returnToStation(): void
}

export interface GameHud {
  hint: string
  dialogue: string
  nearbyLabel: string
  showNpcDialogue: boolean
  npcName: string
  quest: QuestState
  inStation: boolean
  coatColor: CoatColor
  district: DistrictId
  identity: PassengerIdentity
}
