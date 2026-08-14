import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshToonMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import {
  CHARACTER_OCCLUDE_MIN_OPACITY,
  HILLSIDE_KEEPER_INTERACT_RADIUS,
  STREET_NPC_INTERACT_RADIUS,
  STREET_NPC_RADIUS,
  characterOcclusionOpacity,
  npcTalkClearance,
  setCharacterOpacity,
} from './npc'

describe('NPC talk clearance', () => {
  it('leaves room to talk after walking up to a body', () => {
    expect(npcTalkClearance(HILLSIDE_KEEPER_INTERACT_RADIUS)).toBeGreaterThan(1)
    expect(npcTalkClearance(STREET_NPC_INTERACT_RADIUS)).toBeGreaterThan(1)
    expect(STREET_NPC_RADIUS).toBeLessThan(STREET_NPC_INTERACT_RADIUS)
  })
})

describe('character occlusion fade', () => {
  const camera = { x: 0, y: 2, z: 6 }
  const player = { x: 0, y: 1, z: 0 }

  it('stays solid when the person is off the camera line', () => {
    expect(characterOcclusionOpacity(camera, player, { x: 3, y: 1, z: 3 })).toBe(1)
  })

  it('ghosts a person standing between the camera and the player', () => {
    const opacity = characterOcclusionOpacity(camera, player, { x: 0, y: 1.5, z: 3 })
    expect(opacity).toBeCloseTo(CHARACTER_OCCLUDE_MIN_OPACITY)
  })

  it('ignores people behind the camera or past the player', () => {
    expect(characterOcclusionOpacity(camera, player, { x: 0, y: 2, z: 8 })).toBe(1)
    expect(characterOcclusionOpacity(camera, player, { x: 0, y: 1, z: -2 })).toBe(1)
  })
})

describe('character opacity write', () => {
  it('fades unique materials and hides the shared outline shell', () => {
    const outline = new MeshBasicMaterial()
    const coat = new MeshToonMaterial()
    const group = new Group()
    const body = new Mesh(new BoxGeometry(0.4, 1, 0.3), coat)
    const shell = new Mesh(new BoxGeometry(0.44, 1.07, 0.33), outline)
    group.add(body)
    body.add(shell)

    setCharacterOpacity(group, 0.2, outline)
    expect(coat.transparent).toBe(true)
    expect(coat.opacity).toBe(0.2)
    expect(coat.depthWrite).toBe(false)
    expect(shell.visible).toBe(false)

    setCharacterOpacity(group, 1, outline)
    expect(coat.transparent).toBe(false)
    expect(coat.opacity).toBe(1)
    expect(coat.depthWrite).toBe(true)
    expect(shell.visible).toBe(true)

    coat.dispose()
    outline.dispose()
  })
})
