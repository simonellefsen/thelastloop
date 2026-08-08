import { describe, expect, it } from 'vitest'
import { SHARED_LOOP_PROTOCOL, interpolatePresence, isSharedLoopClientMessage } from './shared-loop'

describe('shared-loop protocol seam', () => {
  it('validates bounded client messages without opening a connection', () => {
    expect(isSharedLoopClientMessage({ type: 'hello', protocol: SHARED_LOOP_PROTOCOL, roomId: 'quiet-carriage', identity: { callsign: 'EMBER-7' } })).toBe(true)
    expect(isSharedLoopClientMessage({ type: 'move', position: [1, 2, 3], sequence: 4 })).toBe(true)
    expect(isSharedLoopClientMessage({ type: 'move', position: [1, 2], sequence: -1 })).toBe(false)
  })

  it('interpolates and clamps remote presence positions', () => {
    expect(interpolatePresence([0, 2, 4], [10, 4, 8], 0.25)).toEqual([2.5, 2.5, 5])
    expect(interpolatePresence([0, 0, 0], [1, 1, 1], 2)).toEqual([1, 1, 1])
  })
})
