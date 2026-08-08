export type ClueId = 'signal' | 'mural' | 'bell'
export type CoatColor = 'gold' | 'berry' | 'ocean'
export type DistrictId = 'hillside' | 'harbour'
export type SideQuestId = 'lantern' | 'chorus' | 'harbour'
export type SideQuestStage = 'locked' | 'first' | 'second' | 'complete'

export interface QuestState {
  introductionSeen: boolean
  completedClues: ClueId[]
  stationNameRestored: boolean
  lantern: SideQuestStage
  chorus: SideQuestStage
  harbour: SideQuestStage
}

export interface GameSave {
  version: 2
  soundEnabled: boolean
  coatColor: CoatColor
  district: DistrictId
  playerNormal: [number, number, number]
  quest: QuestState
}

export interface WorldInteractable {
  id: 'station-keeper' | 'station-door' | ClueId | 'lens-cache' | 'signal-repair' | 'tune-card' | 'bell-chime' | 'harbour-valve' | 'harbour-pump'
  label: string
  position: [number, number, number]
}

export interface PlayerController {
  setJoystick(input: { x: number; y: number }): void
  interact(): void
  leaveStation(): void
  cycleCoat(): void
  travelToHarbour(): void
  returnToStation(): void
}

export interface GameHud {
  hint: string
  dialogue: string
  nearbyLabel: string
  quest: QuestState
  inStation: boolean
  coatColor: CoatColor
  district: DistrictId
}
