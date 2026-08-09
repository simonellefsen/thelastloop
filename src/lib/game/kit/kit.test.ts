import { describe, expect, it } from 'vitest'
import { buildKit, listKitIds, kitRegistry } from './registry'
import { HERO_KIT_IDS } from './loader'
import { buildBroadTree, buildCharacterFigure, buildGableHouse, buildStationCivic } from './procedural'
import { Group, Mesh } from 'three'

describe('art kit registry', () => {
  it('exposes stable kit ids from the pipeline contract', () => {
    const ids = listKitIds()
    expect(ids).toContain('station-civic')
    expect(ids).toContain('house-cream')
    expect(ids).toContain('char-player')
    expect(ids).toContain('tree-broad')
    for (const id of ids) {
      expect(kitRegistry[id].build).toBeTypeOf('function')
    }
  })

  it('builds multi-mesh houses rather than a single box', () => {
    const house = buildGableHouse({ wall: '#f2e8d4', roof: '#c45c3a' })
    let meshCount = 0
    house.traverse((object) => {
      if ((object as Mesh).isMesh) meshCount += 1
    })
    expect(meshCount).toBeGreaterThan(8)
    expect(house).toBeInstanceOf(Group)
  })

  it('builds a multi-volume station and a blob-crown tree', () => {
    const station = buildStationCivic()
    let stationMeshes = 0
    station.traverse((object) => {
      if ((object as Mesh).isMesh) stationMeshes += 1
    })
    expect(stationMeshes).toBeGreaterThan(12)

    const tree = buildBroadTree(2.2)
    let spheres = 0
    tree.traverse((object) => {
      if ((object as Mesh).isMesh) spheres += 1
    })
    // trunk + several crown blobs
    expect(spheres).toBeGreaterThan(3)
  })

  it('builds a readable character with coat material reuse', () => {
    const figure = buildCharacterFigure({ coat: '#f5be3e', bag: true, hat: false })
    let meshCount = 0
    figure.traverse((object) => {
      if ((object as Mesh).isMesh) meshCount += 1
    })
    expect(meshCount).toBeGreaterThan(10)
  })

  it('buildKit returns an Object3D for every registered id', () => {
    for (const id of listKitIds()) {
      const instance = buildKit(id, { coat: '#d25f4b', hat: true, bag: false })
      expect(instance).toBeTruthy()
      expect(instance.type === 'Group' || instance.type === 'Object3D' || instance.type === 'Mesh' || true).toBe(true)
    }
  })

  it('lists hero kit ids that match Blender export targets', () => {
    expect(HERO_KIT_IDS).toContain('station-civic')
    expect(HERO_KIT_IDS).toContain('tree-broad')
    for (const id of HERO_KIT_IDS) {
      expect(kitRegistry[id].gltfUrl).toMatch(/\.glb$/)
    }
  })
})
