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
    writeSave(store, save)
    expect(readSave(store)).toEqual(save)
  })
})
