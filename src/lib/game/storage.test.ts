import { describe, expect, it } from 'vitest'
import { defaultSave, freshStorySave, readSave, SAVE_KEY, writeSave } from './storage'
import type { GameSave } from './types'

function memoryStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
}

describe('game save', () => {
  it('falls back safely when saved data is malformed', () => {
    const store = memoryStorage()
    store.setItem(SAVE_KEY, '{not json')
    expect(readSave(store)).toEqual(defaultSave())
  })

  it('round-trips a versioned save', () => {
    const store = memoryStorage()
    const save = defaultSave()
    save.quest.introductionSeen = true
    save.district = 'harbour'
    save.streetPosition = save.streetPositions.harbour
    save.quest.harbour = 'second'
    writeSave(store, save)
    expect(readSave(store)).toEqual(save)
  })

  it('uses the original gold coat for older saves', () => {
    const store = memoryStorage()
    store.setItem(SAVE_KEY, JSON.stringify({ version: 1, soundEnabled: true, playerNormal: [0, 1, 0], quest: defaultSave().quest }))
    expect(readSave(store).coatColor).toBe('gold')
  })

  it('unlocks the new town quests for a restored legacy station', () => {
    const store = memoryStorage()
    store.setItem(SAVE_KEY, JSON.stringify({ version: 1, soundEnabled: true, playerNormal: [0, 1, 0], quest: { ...defaultSave().quest, stationNameRestored: true } }))
    expect(readSave(store).quest.lantern).toBe('first')
    expect(readSave(store).quest.chorus).toBe('first')
    expect(readSave(store).quest.harbour).toBe('locked')
  })

  it('migrates a v1 save to the hillside district', () => {
    const store = memoryStorage()
    store.setItem(SAVE_KEY, JSON.stringify({ version: 1, soundEnabled: true, playerNormal: [0, 1, 0], quest: defaultSave().quest }))
    const save = readSave(store)
    expect(save.version).toBe(7)
    expect(save.district).toBe('hillside')
    expect(save.identity).toEqual({ callsign: 'EMBER-7' })
    expect(save.reducedMotion).toBe(false)
    expect(save.streetPosition).toEqual([0, 7.4])
    expect(save.streetPositions).toEqual({ hillside: [0, 7.4], harbour: [0, 8], observatory: [0, 8] })
  })

  it('persists the optional reduced-motion setting', () => {
    const store = memoryStorage()
    const save = { ...defaultSave(), reducedMotion: true }
    writeSave(store, save)
    expect(readSave(store).reducedMotion).toBe(true)
  })

  it('keeps a validated local street position and rejects a malformed one', () => {
    const store = memoryStorage()
    const save = {
      ...defaultSave(),
      district: 'harbour' as const,
      streetPosition: [11.2, 8.4] as [number, number],
      streetPositions: { ...defaultSave().streetPositions, harbour: [11.2, 8.4] as [number, number] },
    }
    writeSave(store, save)
    expect(readSave(store).streetPosition).toEqual([11.2, 8.4])

    store.setItem(SAVE_KEY, JSON.stringify({ ...save, streetPositions: { ...save.streetPositions, harbour: [Infinity, 'wrong'] } }))
    expect(readSave(store).streetPosition).toEqual(defaultSave().streetPositions.harbour)
  })

  it('migrates ambiguous pre-v7 cross-town positions to safe district arrivals', () => {
    const store = memoryStorage()
    const legacy = { ...defaultSave(), version: 6 as const, district: 'harbour' as const, streetPosition: [11.2, 8.4] as [number, number] }
    store.setItem(SAVE_KEY, JSON.stringify(legacy))

    expect(readSave(store).streetPositions).toEqual({ hillside: [0, 7.4], harbour: [0, 8], observatory: [0, 8] })
  })

  it('keeps independent positions for all towns in a v7 save', () => {
    const store = memoryStorage()
    const save = {
      ...defaultSave(),
      district: 'harbour' as const,
      streetPosition: [1.5, -8] as [number, number],
      streetPositions: { hillside: [-3.2, 5.8], harbour: [1.5, -8], observatory: [4.4, -2.3] } as GameSave['streetPositions'],
    }
    writeSave(store, save)

    expect(readSave(store).streetPositions).toEqual(save.streetPositions)
    expect(readSave(store).streetPosition).toEqual([1.5, -8])
  })

  it('starts a fresh story while retaining player preferences', () => {
    const current = {
      ...defaultSave(),
      soundEnabled: false,
      reducedMotion: true,
      coatColor: 'ocean' as const,
      identity: { callsign: 'MIST-4' },
      district: 'observatory' as const,
      streetPosition: [8.2, -5.4] as [number, number],
      quest: { ...defaultSave().quest, stationNameRestored: true, harbour: 'complete' as const },
    }
    const fresh = freshStorySave(current)

    expect(fresh.quest).toEqual(defaultSave().quest)
    expect(fresh.district).toBe('hillside')
    expect(fresh.streetPosition).toEqual([0, 7.4])
    expect(fresh.soundEnabled).toBe(false)
    expect(fresh.reducedMotion).toBe(true)
    expect(fresh.coatColor).toBe('ocean')
    expect(fresh.identity).toEqual({ callsign: 'MIST-4' })
  })
})
