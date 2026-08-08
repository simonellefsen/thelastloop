import { describe, expect, it } from 'vitest'
import { defaultSave, readSave, SAVE_KEY, writeSave } from './storage'

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
    expect(save.version).toBe(4)
    expect(save.district).toBe('hillside')
    expect(save.identity).toEqual({ callsign: 'EMBER-7' })
  })
})
