export type ClueId = 'signal' | 'mural' | 'bell'

export interface QuestState {
  introductionSeen: boolean
  completedClues: ClueId[]
  stationNameRestored: boolean
}

export interface GameSave {
  version: 1
  soundEnabled: boolean
  playerNormal: [number, number, number]
  quest: QuestState
}

export interface WorldInteractable {
  id: 'station-keeper' | ClueId
  label: string
  position: [number, number, number]
}

export interface PlayerController {
  setJoystick(input: { x: number; y: number }): void
  interact(): void
}

export interface GameHud {
  hint: string
  dialogue: string
  nearbyLabel: string
  quest: QuestState
}
