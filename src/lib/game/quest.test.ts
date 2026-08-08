import { describe, expect, it } from 'vitest'
import { advanceSideQuest, defaultQuest, resolveClue, sideQuestLabel } from './quest'

describe('station-name quest', () => {
  it('restores the station after three distinct clues', () => {
    let quest = defaultQuest()
    quest = resolveClue(quest, 'signal')
    quest = resolveClue(quest, 'mural')
    quest = resolveClue(quest, 'bell')
    expect(quest.stationNameRestored).toBe(true)
    expect(quest.completedClues).toEqual(['signal', 'mural', 'bell'])
    expect(quest.lantern).toBe('first')
    expect(quest.chorus).toBe('first')
  })

  it('advances each unlocked side quest through two steps', () => {
    const restored = { ...defaultQuest(), stationNameRestored: true, lantern: 'first' as const, chorus: 'first' as const }
    const lensFound = advanceSideQuest(restored, 'lantern')
    expect(lensFound.lantern).toBe('second')
    expect(advanceSideQuest(lensFound, 'lantern').lantern).toBe('complete')
    expect(sideQuestLabel('chorus', 'second')).toBe('Ring the hill bell with the tune')
  })

  it('does not duplicate a clue', () => {
    const quest = resolveClue(resolveClue(defaultQuest(), 'signal'), 'signal')
    expect(quest.completedClues).toEqual(['signal'])
  })
})
