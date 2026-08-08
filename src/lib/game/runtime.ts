export function shouldRender(visibilityState: DocumentVisibilityState): boolean {
  return visibilityState === 'visible'
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
