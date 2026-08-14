export function shouldRender(visibilityState: DocumentVisibilityState): boolean {
  return visibilityState === 'visible'
}

/**
 * Shadow filtering quality, overridable with `?shadows=`.
 *
 * Soft (PCF-soft) filtering costs several texture taps for **every lit screen
 * pixel**, so its price scales with resolution rather than with scene complexity.
 * On a fill-rate-bound device that makes it a prime suspect for frame cost, and
 * the only way to confirm is to swap it out and re-measure on the hardware.
 */
export type ShadowMode = 'soft' | 'pcf' | 'basic' | 'off'

/**
 * Multisampling, disabled with `?aa=0`.
 *
 * MSAA resolves and their bandwidth scale with resolution, so on a fill-rate-bound
 * device it is one of the few remaining costs that behaves the way the `dpr`
 * measurements do. At a high pixel ratio the downsample already softens edges, so
 * the visual loss from turning it off is much smaller than at 1x.
 *
 * Must be decided before the renderer exists — WebGL cannot change multisampling
 * on an existing context.
 */
export function resolveAntialias(search: string): boolean {
  const value = new URLSearchParams(search).get('aa')
  return !(value === '0' || value === 'off')
}

/** Screen-space ink (M1.3). Default on; `?ink=0` falls back to inverted hulls. */
export function resolveInkEnabled(search: string): boolean {
  const value = new URLSearchParams(search).get('ink')
  return !(value === '0' || value === 'off')
}

export function resolveShadowMode(search: string): ShadowMode {
  const value = new URLSearchParams(search).get('shadows')
  if (value === '0' || value === 'off') return 'off'
  if (value === 'basic') return 'basic'
  if (value === 'pcf') return 'pcf'
  return 'soft'
}

export function animationTime(elapsed: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : elapsed
}

export interface RenderResolutionState {
  pixelRatio: number
  slowFrames: number
  fastFrames: number
}

/**
 * A deliberately slow adaptive-DPR policy for phones. It reacts only to a
 * sustained frame budget miss, then recovers in small steps after a stable
 * period; one busy frame can never make the image jump in quality.
 */
export function nextRenderResolution(state: RenderResolutionState, frameSeconds: number, cap: number): RenderResolutionState {
  if (frameSeconds > 1 / 29) {
    const slowFrames = state.slowFrames + 1
    if (slowFrames < 45 || state.pixelRatio <= 1) return { ...state, slowFrames, fastFrames: 0 }
    return { pixelRatio: Math.max(1, Number((state.pixelRatio - 0.15).toFixed(2))), slowFrames: 0, fastFrames: 0 }
  }
  if (frameSeconds < 1 / 52) {
    const fastFrames = state.fastFrames + 1
    if (fastFrames < 240 || state.pixelRatio >= cap) return { ...state, slowFrames: 0, fastFrames }
    return { pixelRatio: Math.min(cap, Number((state.pixelRatio + 0.1).toFixed(2))), slowFrames: 0, fastFrames: 0 }
  }
  return { ...state, slowFrames: 0, fastFrames: 0 }
}
