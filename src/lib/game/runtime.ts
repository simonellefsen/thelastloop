export function shouldRender(visibilityState: DocumentVisibilityState): boolean {
  return visibilityState === 'visible'
}

export function animationTime(elapsed: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : elapsed
}
