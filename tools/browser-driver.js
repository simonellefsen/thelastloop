/**
 * Manual frame driver for verifying the game inside an agent browser pane.
 *
 * ## The problem
 *
 * An embedded/headless browser pane reports `document.visibilityState === 'hidden'`
 * and the browser then never fires `requestAnimationFrame`. Two things follow:
 *
 * 1. `GameWorld.tick` early-returns on `shouldRender(document.visibilityState)`.
 * 2. Even with that spoofed, no frames arrive, so nothing moves and the canvas
 *    holds whatever was last drawn.
 *
 * Capturing a screenshot forces a single frame, which is why one-shot screenshots
 * appear to work while movement does not — you get roughly one frame per capture.
 *
 * ## The fix
 *
 * `tick` re-schedules its own rAF *before* the visibility check, so the loop is
 * never dead — it is only starved. Capture that callback and call it yourself.
 *
 * Delta comes from `performance.now()`, not the rAF timestamp, so calling the
 * callback in a synchronous loop would produce delta ≈ 0 and nothing would move.
 * The clock therefore has to be virtualised too. (`tick` clamps delta to 0.05 s,
 * so a step larger than ~50 ms per frame is wasted.)
 *
 * ## Use
 *
 * Paste this into the pane's JS console, then take **one screenshot** to bootstrap:
 * the frame already scheduled with the real rAF has to fire once so that `tick`
 * re-schedules into our queue. After that:
 *
 *   __step(120)                 // advance ~2 s of game time
 *   __key('ArrowUp', true)      // hold a key
 *   __step(90); __key('ArrowUp', false)
 *   __walk('ArrowUp', 90)       // hold, step, release
 *
 * Screenshot whenever you want to see the result. This is a verification aid, not
 * production code — it is never loaded by the app.
 */
;(() => {
  if (window.__drv) return 'already installed'

  // The game gates rendering on visibility; the pane always claims hidden.
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })

  const realNow = performance.now.bind(performance)
  window.__vnow = realNow()
  performance.now = () => window.__vnow

  const queue = []
  window.__q = queue
  window.requestAnimationFrame = (cb) => queue.push(cb)
  window.cancelAnimationFrame = () => {}

  /** Advance `frames` frames of `dtMs` each. Returns frames left queued (should be 1). */
  window.__step = (frames = 60, dtMs = 16.7) => {
    for (let i = 0; i < frames; i += 1) {
      window.__vnow += dtMs
      // Splice first: each callback re-schedules onto the same queue.
      const due = queue.splice(0, queue.length)
      for (const cb of due) cb(window.__vnow)
    }
    return queue.length
  }

  window.__key = (key, down) =>
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key, bubbles: true }))

  /** Hold a key for `frames`, then release and settle. */
  window.__walk = (key, frames = 90, dtMs = 16.7) => {
    window.__key(key, true)
    window.__step(frames, dtMs)
    window.__key(key, false)
    window.__step(4, dtMs)
    return 'walked ' + key + ' for ' + frames + ' frames'
  }

  window.__drv = true
  document.dispatchEvent(new Event('visibilitychange'))
  return 'driver installed — take one screenshot to bootstrap the loop'
})()
