import type { ClueId, QuestState } from './types'

export const clueOrder: ClueId[] = ['signal', 'mural', 'bell']

export function defaultQuest(): QuestState {
  return { introductionSeen: false, completedClues: [], stationNameRestored: false }
}

export function resolveClue(quest: QuestState, clue: ClueId): QuestState {
  if (quest.completedClues.includes(clue)) return quest
  const completedClues = [...quest.completedClues, clue]
  return {
    ...quest,
    completedClues,
    stationNameRestored: completedClues.length === clueOrder.length,
  }
}

export function clueCount(quest: QuestState): number {
  return quest.completedClues.length
}
