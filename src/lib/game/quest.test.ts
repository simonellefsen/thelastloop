import { describe, expect, it } from 'vitest'
import { defaultQuest, resolveClue } from './quest'

describe('station-name quest', () => {
  it('restores the station after three distinct clues', () => {
    let quest = defaultQuest()
    quest = resolveClue(quest, 'signal')
    quest = resolveClue(quest, 'mural')
    quest = resolveClue(quest, 'bell')
    expect(quest.stationNameRestored).toBe(true)
    expect(quest.completedClues).toEqual(['signal', 'mural', 'bell'])
  })

  it('does not duplicate a clue', () => {
    const quest = resolveClue(resolveClue(defaultQuest(), 'signal'), 'signal')
    expect(quest.completedClues).toEqual(['signal'])
  })
})
