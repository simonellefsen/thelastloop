export type ClueId = 'signal' | 'mural' | 'bell'
export type CoatColor = 'gold' | 'berry' | 'ocean'

export interface QuestState {
  introductionSeen: boolean
  completedClues: ClueId[]
  stationNameRestored: boolean
}

export interface GameSave {
  version: 1
  soundEnabled: boolean
  coatColor: CoatColor
  playerNormal: [number, number, number]
  quest: QuestState
}

export interface WorldInteractable {
  id: 'station-keeper' | 'station-door' | ClueId
  label: string
  position: [number, number, number]
}

export interface PlayerController {
  setJoystick(input: { x: number; y: number }): void
  interact(): void
  leaveStation(): void
  cycleCoat(): void
}

export interface GameHud {
  hint: string
  dialogue: string
  nearbyLabel: string
  quest: QuestState
  inStation: boolean
  coatColor: CoatColor
}
