import { describe, expect, it } from 'vitest'
import { animationTime, nextRenderResolution, resolveAntialias, resolveShadowMode, shouldRender } from './runtime'

describe('renderer runtime policy', () => {
  it('renders only visible documents', () => {
    expect(shouldRender('visible')).toBe(true)
    expect(shouldRender('hidden')).toBe(false)
  })

  it('freezes decorative motion when reduced motion is requested', () => {
    expect(animationTime(12.4, true)).toBe(0)
    expect(animationTime(12.4, false)).toBe(12.4)
  })

  it('drops pixel density only after sustained slow frames', () => {
    const next = nextRenderResolution({ pixelRatio: 1.65, slowFrames: 44, fastFrames: 0 }, 1 / 24, 1.65)
    expect(next).toEqual({ pixelRatio: 1.5, slowFrames: 0, fastFrames: 0 })
  })

  it('recovers pixel density conservatively and honours its cap', () => {
    const next = nextRenderResolution({ pixelRatio: 1.4, slowFrames: 0, fastFrames: 239 }, 1 / 60, 1.65)
    expect(next).toEqual({ pixelRatio: 1.5, slowFrames: 0, fastFrames: 0 })
    expect(nextRenderResolution({ pixelRatio: 1.65, slowFrames: 0, fastFrames: 239 }, 1 / 60, 1.65).pixelRatio).toBe(1.65)
  })
})

describe('shadow mode override', () => {
  it('defaults to soft filtering', () => {
    expect(resolveShadowMode('')).toBe('soft')
    expect(resolveShadowMode('?perf=1')).toBe('soft')
  })

  it('accepts the cheaper filters and a full disable', () => {
    expect(resolveShadowMode('?shadows=pcf')).toBe('pcf')
    expect(resolveShadowMode('?shadows=basic')).toBe('basic')
    expect(resolveShadowMode('?shadows=off')).toBe('off')
    expect(resolveShadowMode('?shadows=0')).toBe('off')
  })

  it('falls back to soft for anything unrecognised', () => {
    expect(resolveShadowMode('?shadows=fancy')).toBe('soft')
  })
})

describe('antialias override', () => {
  it('multisamples by default', () => {
    expect(resolveAntialias('')).toBe(true)
    expect(resolveAntialias('?perf=1')).toBe(true)
  })

  it('turns off for the fill-rate comparison', () => {
    expect(resolveAntialias('?aa=0')).toBe(false)
    expect(resolveAntialias('?aa=off')).toBe(false)
  })
})
