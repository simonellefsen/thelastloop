import { describe, expect, it } from 'vitest'
import { defaultQuest } from './quest'
import { soundscapeProfile } from './soundscape'

describe('soundscape profile', () => {
  it('begins with only a quiet outdoor wind layer', () => {
    expect(soundscapeProfile(defaultQuest())).toEqual({ wind: 0.024, rail: 0, birds: 0, roomTone: 0, music: 0 })
  })

  it('adds the restored world layers at the correct milestones', () => {
    const quest = { ...defaultQuest(), stationNameRestored: true, chorus: 'complete' as const }
    expect(soundscapeProfile(quest)).toMatchObject({ rail: 0.012, birds: 0.045, music: 0.032 })
    expect(soundscapeProfile(quest, true)).toMatchObject({ wind: 0.008, birds: 0, roomTone: 0.018, music: 0.024 })
  })
})
