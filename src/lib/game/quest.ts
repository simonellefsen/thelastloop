import type { ClueId, QuestState, SideQuestId, SideQuestStage } from './types'

export const clueOrder: ClueId[] = ['signal', 'mural', 'bell']

export function defaultQuest(): QuestState {
  return { introductionSeen: false, completedClues: [], stationNameRestored: false, lantern: 'locked', chorus: 'locked', harbour: 'locked', observatory: 'locked' }
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

export function unlockHarbour(quest: QuestState): QuestState {
  if (!quest.stationNameRestored || quest.harbour !== 'locked') return quest
  return { ...quest, harbour: 'first' }
}

export function unlockObservatory(quest: QuestState): QuestState {
  if (!quest.stationNameRestored || quest.observatory !== 'locked') return quest
  return { ...quest, observatory: 'first' }
}

/** The vertical slice closes only after every town has regained its light. */
export function isJourneyComplete(quest: QuestState): boolean {
  return quest.stationNameRestored
    && quest.lantern === 'complete'
    && quest.chorus === 'complete'
    && quest.harbour === 'complete'
    && quest.observatory === 'complete'
}

export function sideQuestLabel(id: SideQuestId, stage: SideQuestStage): string {
  if (stage === 'complete') return id === 'lantern' ? 'Green light restored' : id === 'chorus' ? 'Morning chorus heard' : id === 'harbour' ? 'Tide clock restored' : 'Moon signal restored'
  if (stage === 'second') return id === 'lantern' ? 'Fit the lens at the signal' : id === 'chorus' ? 'Ring the hill bell with the tune' : id === 'harbour' ? 'Return to the dock pump' : 'Align the telescope'
  if (stage === 'first') return id === 'lantern' ? 'Find the depot lens' : id === 'chorus' ? 'Find the market tune card' : id === 'harbour' ? 'Find the tide valve' : 'Find the starlight lens'
  return 'Restore Sunset Loop first'
}
