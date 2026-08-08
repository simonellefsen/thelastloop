import { defaultQuest } from './quest'
import type { GameSave } from './types'

export const SAVE_KEY = 'thelastloop.save.v1'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function defaultSave(): GameSave {
  return {
    version: 1,
    soundEnabled: true,
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
      playerNormal: parsed.playerNormal as GameSave['playerNormal'],
      quest: {
        introductionSeen: Boolean(parsed.quest.introductionSeen),
        completedClues: Array.isArray(parsed.quest.completedClues) ? parsed.quest.completedClues.filter((clue): clue is 'signal' | 'mural' | 'bell' => clue === 'signal' || clue === 'mural' || clue === 'bell') : [],
        stationNameRestored: Boolean(parsed.quest.stationNameRestored),
      },
    }
  } catch {
    return fallback
  }
}

export function writeSave(storage: StorageLike, save: GameSave): void {
  storage.setItem(SAVE_KEY, JSON.stringify(save))
}
