import type { ClueId, QuestState, SideQuestId, SideQuestStage } from './types'

export const clueOrder: ClueId[] = ['signal', 'mural', 'bell']

export function defaultQuest(): QuestState {
  return { introductionSeen: false, completedClues: [], stationNameRestored: false, lantern: 'locked', chorus: 'locked' }
}

export function resolveClue(quest: QuestState, clue: ClueId): QuestState {
  if (quest.completedClues.includes(clue)) return quest
  const completedClues = [...quest.completedClues, clue]
  const restored = completedClues.length === clueOrder.length
  return {
    ...quest,
    completedClues,
    stationNameRestored: restored,
    lantern: restored ? 'first' : quest.lantern,
    chorus: restored ? 'first' : quest.chorus,
  }
}

export function clueCount(quest: QuestState): number {
  return quest.completedClues.length
}

export function advanceSideQuest(quest: QuestState, id: SideQuestId): QuestState {
  const stage = quest[id]
  const next: SideQuestStage = stage === 'first' ? 'second' : stage === 'second' ? 'complete' : stage
  return { ...quest, [id]: next }
}

export function sideQuestLabel(id: SideQuestId, stage: SideQuestStage): string {
  if (stage === 'complete') return id === 'lantern' ? 'Green light restored' : 'Morning chorus heard'
  if (stage === 'second') return id === 'lantern' ? 'Fit the lens at the signal' : 'Ring the hill bell with the tune'
  if (stage === 'first') return id === 'lantern' ? 'Find the depot lens' : 'Find the market tune card'
  return 'Restore Sunset Loop first'
}
