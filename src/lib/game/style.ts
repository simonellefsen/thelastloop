import {
  BackSide,
  CanvasTexture,
  Color,
  DataTexture,
  DoubleSide,
  ExtrudeGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RepeatWrapping,
  RGBAFormat,
  Shape,
  type Material,
  type BufferGeometry,
  type Texture,
} from 'three'
import type { CoatColor } from './types'

export type PaintKind = 'grass' | 'cobble' | 'water' | 'road' | 'plank' | 'plaster'

export const coatColors: Record<CoatColor, string> = {
  gold: '#f5be3e',
  berry: '#d85d67',
  ocean: '#3f8d9f',
}

/** Shared illustration palette — keep in sync with docs/ART_DIRECTION.md */
export const artPalette = {
  skyZenith: '#8ecfca',
  skyMid: '#b5e2dc',
  skyHorizon: '#dcefd4',
  fog: '#c5e4d8',
  sceneBackground: '#a8d9d2',
  sun: '#fff4d4',
  ambient: '#fff5e0',
  hemiSky: '#e8fff8',
  hemiGround: '#6a8f6a',
  outline: '#1c2e34',
  skin: '#edaf8f',
  hair: '#2a3438',
  timber: '#3a2a24',
  timberSoft: '#574239',
  cream: '#f2e8d4',
  ochre: '#e0b86a',
  roseBrick: '#b65a48',
  whitewash: '#f7f1e4',
  terracotta: '#c45c3a',
  terracottaDeep: '#a84a32',
  roofSlate: '#4a5f64',
  glass: '#dce8df',
  door: '#31555b',
  grass: '#6fad62',
  grassDeep: '#4f8a52',
  cobblePale: '#d4c6a4',
  cobbleWarm: '#b39a74',
  road: '#5a7276',
  kerb: '#efe6c4',
  marshWater: '#4a8f8a',
  bag: '#6b4636',
  sock: '#f4f0e6',
  shoe: '#2c3538',
} as const

const coatOrder: CoatColor[] = ['gold', 'berry', 'ocean']

export function nextCoatColor(current: CoatColor): CoatColor {
  return coatOrder[(coatOrder.indexOf(current) + 1) % coatOrder.length]
}

let toonGradient: DataTexture | undefined
let sharedOutlineMaterial: MeshBasicMaterial | undefined

/** 3-step light ramp for MeshToonMaterial (Messenger-like cel shading). */
export function getToonGradientMap(): DataTexture {
  if (toonGradient) return toonGradient
  const steps = 3
  const data = new Uint8Array(steps * 4)
  for (let index = 0; index < steps; index += 1) {
    // Keep the darkest step above pure black so forms stay soft.
    const value = Math.round(72 + (index / (steps - 1)) * 183)
    data[index * 4] = value
    data[index * 4 + 1] = value
    data[index * 4 + 2] = value
    data[index * 4 + 3] = 255
  }
  toonGradient = new DataTexture(data, steps, 1, RGBAFormat)
  toonGradient.minFilter = NearestFilter
  toonGradient.magFilter = NearestFilter
  toonGradient.needsUpdate = true
  return toonGradient
}

export function getOutlineMaterial(): MeshBasicMaterial {
  if (sharedOutlineMaterial) return sharedOutlineMaterial
  sharedOutlineMaterial = new MeshBasicMaterial({
    color: artPalette.outline,
    side: BackSide,
    fog: true,
  })
  return sharedOutlineMaterial
}

export interface CelMaterialOptions {
  emissive?: string
  emissiveIntensity?: number
  transparent?: boolean
  opacity?: number
  side?: Material['side']
}

/** Flat cel material used by the visual prototype and new kits. */
export function celMaterial(color: string, options: CelMaterialOptions = {}): MeshToonMaterial {
  const material = new MeshToonMaterial({
    color,
    gradientMap: getToonGradientMap(),
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  })
  if (options.side !== undefined) material.side = options.side
  if (options.emissive) {
    material.emissive = new Color(options.emissive)
    material.emissiveIntensity = options.emissiveIntensity ?? 0.6
  }
  return material
}

/** Inverted-hull outline for a single mesh (cheap comic-book edge). */
export function addMeshOutline(mesh: Mesh, scale = 1.07): Mesh {
  const outline = new Mesh(mesh.geometry, getOutlineMaterial())
  outline.scale.setScalar(scale)
  outline.renderOrder = -1
  // Keep outlines out of raycasts / interaction picking if any are added later.
  outline.raycast = () => undefined
  mesh.add(outline)
  return outline
}

/** Apply outlines to meshes in a character group (skips existing outline shells). */
export function outlineCharacter(group: { traverse: (callback: (object: object) => void) => void }, scale = 1.08): void {
  group.traverse((object) => {
    if (!(object as Mesh).isMesh) return
    const mesh = object as Mesh
    if (mesh.material === getOutlineMaterial()) return
    if (mesh.children.some((child) => (child as Mesh).isMesh && (child as Mesh).material === getOutlineMaterial())) return
    addMeshOutline(mesh, scale)
  })
}

/**
 * Triangular gable roof prism. Width spans the street frontage;
 * depth is the building depth; height is ridge rise above the eaves.
 */
export function createGableRoofGeometry(
  width: number,
  height: number,
  depth: number,
  /**
   * Run the ridge along X instead of Z. Long buildings need this: a wide, shallow
   * span read as a flat slab from the low street camera rather than as a roof.
   * With this set, `width` is the slope span and `depth` is the ridge length.
   */
  ridgeAlongX = false,
): BufferGeometry {
  const shape = new Shape()
  shape.moveTo(-width / 2, 0)
  shape.lineTo(0, height)
  shape.lineTo(width / 2, 0)
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  })
  // Extrude goes along +Z; lay the prism so Y is up and depth faces the street.
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, 0, -depth / 2)
  if (ridgeAlongX) geometry.rotateY(Math.PI / 2)
  geometry.computeVertexNormals()
  return geometry
}

/** Soft vertical sky gradient for a large inverted sphere. */
export function createSkyGradientTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) {
    const fallback = new CanvasTexture(canvas)
    return fallback
  }
  const gradient = context.createLinearGradient(0, 0, 0, 128)
  gradient.addColorStop(0, artPalette.skyZenith)
  gradient.addColorStop(0.42, artPalette.skyMid)
  gradient.addColorStop(0.78, artPalette.skyHorizon)
  gradient.addColorStop(1, '#e8f2d2')
  context.fillStyle = gradient
  context.fillRect(0, 0, 4, 128)
  // Soft cloud blotches — illustration, not photoreal.
  context.globalAlpha = 0.18
  context.fillStyle = '#ffffff'
  for (const [y, size] of [[28, 18], [40, 28], [52, 16], [36, 22]] as Array<[number, number]>) {
    context.beginPath()
    context.ellipse(2, y, 1.6, size / 8, 0, 0, Math.PI * 2)
    context.fill()
  }
  context.globalAlpha = 1
  const texture = new CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

const paintTextures = new Map<PaintKind, Texture>()

function hashNoise(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 45.164) * 43758.5453
  return value - Math.floor(value)
}

function solidPaintFallback(kind: PaintKind): Texture {
  // Node/tests have no canvas; a 1×1 stand-in keeps material construction pure.
  const tones: Record<PaintKind, [number, number, number]> = {
    grass: [111, 173, 98],
    cobble: [203, 185, 150],
    water: [74, 143, 138],
    road: [90, 114, 118],
    plank: [154, 121, 88],
    plaster: [242, 232, 212],
  }
  const [r, g, b] = tones[kind]
  const data = new Uint8Array([r, g, b, 255])
  const texture = new DataTexture(data, 1, 1, RGBAFormat)
  texture.needsUpdate = true
  paintTextures.set(kind, texture)
  return texture
}

/** Low-res hand-painted style maps (shared, repeating). Not photos. */
export function createPaintTexture(kind: PaintKind): Texture {
  const cached = paintTextures.get(kind)
  if (cached) return cached

  if (typeof document === 'undefined') return solidPaintFallback(kind)

  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return solidPaintFallback(kind)

  if (kind === 'grass') {
    context.fillStyle = '#6fad62'
    context.fillRect(0, 0, size, size)
    for (let index = 0; index < 90; index += 1) {
      const x = hashNoise(index, 1, 3) * size
      const y = hashNoise(index, 2, 7) * size
      const radius = 2 + hashNoise(index, 3, 11) * 7
      context.fillStyle = hashNoise(index, 4, 13) > 0.5 ? '#5c9a54' : '#7fbe6d'
      context.globalAlpha = 0.45 + hashNoise(index, 5, 17) * 0.4
      context.beginPath()
      context.ellipse(x, y, radius, radius * 0.7, 0, 0, Math.PI * 2)
      context.fill()
    }
    context.globalAlpha = 0.35
    context.strokeStyle = '#3f7042'
    context.lineWidth = 1
    for (let index = 0; index < 40; index += 1) {
      const x = hashNoise(index, 8, 19) * size
      const y = hashNoise(index, 9, 23) * size
      context.beginPath()
      context.moveTo(x, y)
      context.lineTo(x + 1, y - 3 - hashNoise(index, 10, 29) * 4)
      context.stroke()
    }
  } else if (kind === 'cobble') {
    context.fillStyle = '#cbb996'
    context.fillRect(0, 0, size, size)
    const cell = 8
    for (let y = 0; y < size; y += cell) {
      for (let x = 0; x < size; x += cell) {
        const jitterX = (hashNoise(x, y, 2) - 0.5) * 1.8
        const jitterY = (hashNoise(x, y, 5) - 0.5) * 1.8
        const shade = 160 + Math.floor(hashNoise(x, y, 9) * 55)
        context.fillStyle = `rgb(${shade}, ${shade - 18}, ${shade - 40})`
        context.fillRect(x + 1 + jitterX, y + 1 + jitterY, cell - 2.2, cell - 2.2)
        context.strokeStyle = 'rgba(70, 58, 42, 0.35)'
        context.lineWidth = 1
        context.strokeRect(x + 1 + jitterX, y + 1 + jitterY, cell - 2.2, cell - 2.2)
      }
    }
  } else if (kind === 'water') {
    context.fillStyle = '#4a8f8a'
    context.fillRect(0, 0, size, size)
    for (let index = 0; index < 18; index += 1) {
      const y = (index / 18) * size + hashNoise(index, 1, 4) * 3
      context.strokeStyle = index % 2 === 0 ? 'rgba(180, 230, 220, 0.35)' : 'rgba(30, 80, 78, 0.28)'
      context.lineWidth = 1.5 + hashNoise(index, 2, 6) * 2
      context.beginPath()
      context.moveTo(0, y)
      for (let x = 0; x <= size; x += 8) {
        context.lineTo(x, y + Math.sin(x * 0.35 + index) * 3)
      }
      context.stroke()
    }
    context.globalAlpha = 0.2
    context.fillStyle = '#9ad9d0'
    for (let index = 0; index < 12; index += 1) {
      context.beginPath()
      context.ellipse(hashNoise(index, 3, 8) * size, hashNoise(index, 4, 9) * size, 6, 3, 0, 0, Math.PI * 2)
      context.fill()
    }
  } else if (kind === 'road') {
    context.fillStyle = '#5a7276'
    context.fillRect(0, 0, size, size)
    for (let index = 0; index < 50; index += 1) {
      const x = hashNoise(index, 1, 2) * size
      const y = hashNoise(index, 2, 3) * size
      context.fillStyle = hashNoise(index, 3, 4) > 0.5 ? '#4d6468' : '#6a8286'
      context.globalAlpha = 0.4
      context.fillRect(x, y, 3 + hashNoise(index, 5, 6) * 8, 2 + hashNoise(index, 7, 8) * 5)
    }
    context.globalAlpha = 0.15
    context.fillStyle = '#2f4448'
    context.fillRect(0, size * 0.45, size, 2)
  } else if (kind === 'plank') {
    context.fillStyle = '#9a7958'
    context.fillRect(0, 0, size, size)
    for (let y = 0; y < size; y += 10) {
      const shade = 130 + Math.floor(hashNoise(y, 1, 2) * 40)
      context.fillStyle = `rgb(${shade}, ${shade - 30}, ${shade - 55})`
      context.fillRect(0, y, size, 9)
      context.strokeStyle = 'rgba(50, 35, 25, 0.4)'
      context.beginPath()
      context.moveTo(0, y + 9)
      context.lineTo(size, y + 9)
      context.stroke()
      for (let knot = 0; knot < 2; knot += 1) {
        context.fillStyle = 'rgba(70, 48, 32, 0.35)'
        context.beginPath()
        context.arc(hashNoise(y, knot, 5) * size, y + 4, 1.2, 0, Math.PI * 2)
        context.fill()
      }
    }
  } else {
    // plaster
    context.fillStyle = '#f2e8d4'
    context.fillRect(0, 0, size, size)
    for (let index = 0; index < 70; index += 1) {
      context.fillStyle = hashNoise(index, 1, 2) > 0.5 ? 'rgba(210, 190, 160, 0.35)' : 'rgba(255, 250, 240, 0.3)'
      context.beginPath()
      context.ellipse(
        hashNoise(index, 2, 3) * size,
        hashNoise(index, 3, 4) * size,
        2 + hashNoise(index, 4, 5) * 8,
        2 + hashNoise(index, 5, 6) * 6,
        0,
        0,
        Math.PI * 2,
      )
      context.fill()
    }
    context.strokeStyle = 'rgba(140, 120, 95, 0.15)'
    context.lineWidth = 1
    context.strokeRect(2, 2, size - 4, size - 4)
  }

  context.globalAlpha = 1
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  const repeat = kind === 'grass' ? 10 : kind === 'water' ? 6 : kind === 'road' ? 8 : 5
  texture.repeat.set(repeat, repeat)
  texture.needsUpdate = true
  paintTextures.set(kind, texture)
  return texture
}

/** Cel material with a shared illustration paint map. */
export function paintedMaterial(kind: PaintKind, color: string, options: CelMaterialOptions = {}): MeshToonMaterial {
  const material = celMaterial(color, options)
  material.map = createPaintTexture(kind)
  material.needsUpdate = true
  if (options.side === undefined) material.side = DoubleSide
  return material
}

/** Guess a paint kind from a hex ground colour (for existing call sites). */
export function paintKindForColor(color: string): PaintKind {
  const hex = color.toLowerCase()
  if (
    hex.includes('347f8b')
    || hex.includes('327e89')
    || hex.includes('4a8f8a')
    || hex.includes('276f7a')
    || hex.includes('70b6b2')
    || hex.includes('4d9a9a')
    || hex.includes('5f94a1')
  ) return 'water'
  if (
    hex.includes('79bd68')
    || hex.includes('6fad62')
    || hex.includes('708b7d')
    || hex.includes('718d79')
    || hex.includes('4f8a52')
    || hex.includes('3e815e')
    || hex.includes('7f9b79')
  ) return 'grass'
  if (hex.includes('516d71') || hex.includes('5a7276') || hex.includes('697f79') || hex.includes('405b5e') || hex.includes('556c6f') || hex.includes('5b6975')) return 'road'
  if (hex.includes('9a7958') || hex.includes('9f835f') || hex.includes('855e43') || hex.includes('704f3d') || hex.includes('765942')) return 'plank'
  return 'cobble'
}
