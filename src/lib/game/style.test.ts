import { describe, expect, it } from 'vitest'
import {
  artPalette,
  celMaterial,
  createFootprintGableRoof,
  createGableRoofGeometry,
  createPaintTexture,
  getOutlineMaterial,
  getToonGradientMap,
  nextCoatColor,
  paintKindForColor,
  paintedMaterial,
} from './style'
import { roofRidgesAlongStreet } from './kit/scale'

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

  it('runs the ridge along the street on long working sheds', () => {
    expect(roofRidgesAlongStreet(2.85, 2.15)).toBe(false)
    expect(roofRidgesAlongStreet(3.6, 2.35)).toBe(true)
    expect(roofRidgesAlongStreet(7.25, 2.45)).toBe(true)
    const house = createFootprintGableRoof(2.85, 2.15)
    const shed = createFootprintGableRoof(3.6, 2.35)
    expect(house.attributes.position.count).toBeGreaterThan(6)
    expect(shed.attributes.position.count).toBeGreaterThan(6)
    house.dispose()
    shed.dispose()
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
