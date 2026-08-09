import { describe, expect, it } from 'vitest'
import {
  artPalette,
  celMaterial,
  createGableRoofGeometry,
  createPaintTexture,
  getOutlineMaterial,
  getToonGradientMap,
  nextCoatColor,
  paintKindForColor,
  paintedMaterial,
} from './style'

describe('coat customisation', () => {
  it('cycles through every original coat colour', () => {
    expect(nextCoatColor('gold')).toBe('berry')
    expect(nextCoatColor('berry')).toBe('ocean')
    expect(nextCoatColor('ocean')).toBe('gold')
  })
})

describe('art direction tokens', () => {
  it('exposes the Ravnbro-facing palette keys used by the visual prototype', () => {
    expect(artPalette.terracotta).toMatch(/^#/)
    expect(artPalette.fog).toMatch(/^#/)
    expect(artPalette.timber).toBe('#3a2a24')
    expect(artPalette.outline).toBe('#1c2e34')
  })

  it('builds a shared 3-step toon ramp', () => {
    const gradient = getToonGradientMap()
    expect(gradient.image.width).toBe(3)
    expect(getToonGradientMap()).toBe(gradient)
  })

  it('creates cel materials bound to the shared ramp', () => {
    const material = celMaterial(artPalette.cream)
    expect(material.gradientMap).toBe(getToonGradientMap())
    material.dispose()
  })

  it('reuses one outline material', () => {
    expect(getOutlineMaterial()).toBe(getOutlineMaterial())
  })

  it('builds a gable roof prism with volume', () => {
    const geometry = createGableRoofGeometry(2.4, 0.7, 2.0)
    expect(geometry.attributes.position.count).toBeGreaterThan(6)
    geometry.dispose()
  })

  it('caches painted surface textures and classifies ground colours', () => {
    expect(createPaintTexture('grass')).toBe(createPaintTexture('grass'))
    expect(createPaintTexture('cobble')).toBeTruthy()
    expect(paintKindForColor('#6fad62')).toBe('grass')
    expect(paintKindForColor('#347f8b')).toBe('water')
    expect(paintKindForColor('#4d9a9a')).toBe('water')
    expect(paintKindForColor('#d4c6a4')).toBe('cobble')
    expect(paintKindForColor('#765942')).toBe('plank')
    const material = paintedMaterial('cobble', artPalette.cobblePale)
    expect(material.map).toBe(createPaintTexture('cobble'))
    material.dispose()
  })
})
