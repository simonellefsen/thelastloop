import { defaultQuest } from './quest'
import type { CoatColor, GameSave, QuestState, SideQuestStage } from './types'

export const SAVE_KEY = 'thelastloop.save.v1'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function defaultSave(): GameSave {
  return {
    version: 1,
    soundEnabled: true,
    coatColor: 'gold',
    playerNormal: [0.19, 0.96, 0.2],
    quest: defaultQuest(),
  }
}

export function readSave(storage: StorageLike): GameSave {
  const fallback = defaultSave()
  try {
    const parsed = JSON.parse(storage.getItem(SAVE_KEY) ?? '') as Partial<GameSave>
    if (parsed.version !== 1 || !Array.isArray(parsed.playerNormal) || parsed.playerNormal.length !== 3 || !parsed.quest) return fallback
    return {
      version: 1,
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : fallback.soundEnabled,
      coatColor: isCoatColor(parsed.coatColor) ? parsed.coatColor : fallback.coatColor,
      playerNormal: parsed.playerNormal as GameSave['playerNormal'],
      quest: hydrateQuest(parsed.quest),
    }
  } catch {
    return fallback
  }
}

function hydrateQuest(quest: Partial<QuestState>): QuestState {
  const stationNameRestored = Boolean(quest.stationNameRestored)
  return {
    introductionSeen: Boolean(quest.introductionSeen),
    completedClues: Array.isArray(quest.completedClues) ? quest.completedClues.filter((clue): clue is 'signal' | 'mural' | 'bell' => clue === 'signal' || clue === 'mural' || clue === 'bell') : [],
    stationNameRestored,
    lantern: normaliseSideQuestStage(quest.lantern, stationNameRestored),
    chorus: normaliseSideQuestStage(quest.chorus, stationNameRestored),
  }
}

function normaliseSideQuestStage(value: unknown, unlocked: boolean): SideQuestStage {
  if (value === 'first' || value === 'second' || value === 'complete') return value
  return unlocked ? 'first' : 'locked'
}

function isCoatColor(value: unknown): value is CoatColor {
  return value === 'gold' || value === 'berry' || value === 'ocean'
}

export function writeSave(storage: StorageLike, save: GameSave): void {
  storage.setItem(SAVE_KEY, JSON.stringify(save))
}
