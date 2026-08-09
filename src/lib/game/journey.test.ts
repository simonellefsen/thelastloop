import { describe, expect, it } from 'vitest'
import { createRailJourney, railJourneyLabel, railJourneyProgress } from './journey'

describe('rail journeys', () => {
  it('clamps animated progress between the station and destination', () => {
    expect(railJourneyProgress(-2, 4)).toBe(0)
    expect(railJourneyProgress(2, 4)).toBe(0.5)
    expect(railJourneyProgress(8, 4)).toBe(1)
    expect(railJourneyProgress(0, 0)).toBe(1)
  })

  it('names both outbound and returning local services', () => {
    expect(railJourneyLabel('hillside', 'harbour')).toBe('REEDWATER VIADUCT')
    expect(railJourneyLabel('observatory', 'hillside')).toBe('NIGHTFALL RETURN')
  })

  it('provides render-ready journey data', () => {
    expect(createRailJourney('hillside', 'observatory', 1.05, 4.2)).toMatchObject({
      from: 'hillside', to: 'observatory', label: 'NIGHTFALL CUTTING', progress: 0.25,
    })
  })
})
