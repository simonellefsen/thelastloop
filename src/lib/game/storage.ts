import { defaultQuest } from './quest'
import { defaultPassengerIdentity, isPassengerIdentity } from './presence'
import type { CoatColor, DistrictId, GameSave, QuestState, SideQuestStage } from './types'

export const SAVE_KEY = 'thelastloop.save.v1'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function defaultSave(): GameSave {
  return {
    version: 5,
    soundEnabled: true,
    reducedMotion: false,
    coatColor: 'gold',
    identity: defaultPassengerIdentity(),
    district: 'hillside',
    playerNormal: [0.19, 0.96, 0.2],
    quest: defaultQuest(),
  }
}

export function readSave(storage: StorageLike): GameSave {
  const fallback = defaultSave()
  try {
    const parsed = JSON.parse(storage.getItem(SAVE_KEY) ?? '') as Omit<Partial<GameSave>, 'version'> & { version?: number }
    if ((parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3 && parsed.version !== 4 && parsed.version !== 5) || !Array.isArray(parsed.playerNormal) || parsed.playerNormal.length !== 3 || !parsed.quest) return fallback
    return {
      version: 5,
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : fallback.soundEnabled,
      reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : fallback.reducedMotion,
      coatColor: isCoatColor(parsed.coatColor) ? parsed.coatColor : fallback.coatColor,
      identity: isPassengerIdentity(parsed.identity) ? parsed.identity : fallback.identity,
      district: isDistrict(parsed.district) ? parsed.district : fallback.district,
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
    harbour: normaliseSideQuestStage(quest.harbour, false),
    observatory: normaliseSideQuestStage(quest.observatory, false),
  }
}

function normaliseSideQuestStage(value: unknown, unlocked: boolean): SideQuestStage {
  if (value === 'first' || value === 'second' || value === 'complete') return value
  return unlocked ? 'first' : 'locked'
}

function isCoatColor(value: unknown): value is CoatColor {
  return value === 'gold' || value === 'berry' || value === 'ocean'
}

function isDistrict(value: unknown): value is DistrictId {
  return value === 'hillside' || value === 'harbour' || value === 'observatory'
}

export function writeSave(storage: StorageLike, save: GameSave): void {
  storage.setItem(SAVE_KEY, JSON.stringify(save))
}
