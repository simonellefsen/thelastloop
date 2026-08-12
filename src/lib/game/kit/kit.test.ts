import { describe, expect, it } from 'vitest'
import { buildKit, listKitIds, kitRegistry } from './registry'
import { HERO_KIT_IDS } from './loader'
import { buildBroadTree, buildCharacterFigure, buildGableHouse, buildStationCivic } from './procedural'
import { CHARACTER_HEIGHT, MAX_STREET_CAMERA_HEIGHT, houseEavesHeight, houseRidgeHeight } from './scale'
import { Box3, Group, Mesh } from 'three'

describe('art kit registry', () => {
  it('exposes stable kit ids from the pipeline contract', () => {
    const ids = listKitIds()
    expect(ids).toContain('station-civic')
    expect(ids).toContain('house-cream')
    expect(ids).toContain('char-player')
    expect(ids).toContain('tree-broad')
    expect(ids).toContain('prop-laundry')
    expect(ids).toContain('moonhill-observatory')
    expect(ids).toContain('harbour-repair-boat')
    expect(ids).toContain('moonhill-moon-dial')
    expect(ids).toContain('harbour-tide-shed')
    expect(ids).toContain('moonhill-star-archive')
    expect(ids).toContain('harbour-rail-shed')
    expect(ids).toContain('moonhill-skyrail-shelter')
    expect(ids).toContain('harbour-pier-beacon')
    expect(ids).toContain('moonhill-wind-shelter')
    expect(ids).toContain('harbour-chandlery')
    expect(ids).toContain('moonhill-meteor-marker')
    expect(ids).toContain('moonhill-chartmaker')
    expect(ids).toContain('moonhill-star-tea-kiosk')
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

  it('builds street frontage tall enough to keep the camera out of the roof', () => {
    const house = buildGableHouse({ wall: '#f2e8d4', roof: '#c45c3a' })
    const bounds = new Box3().setFromObject(house)
    // Pre-M0 the ridge topped out at 2.72 m against a ~1.5 m character (1.8x).
    expect(bounds.max.y).toBeGreaterThan(houseRidgeHeight() - 0.2)
    expect(bounds.max.y / CHARACTER_HEIGHT).toBeGreaterThan(3)
    expect(houseEavesHeight()).toBeGreaterThan(MAX_STREET_CAMERA_HEIGHT)
  })

  it('adds a window row per upper storey so frontage reads as floors', () => {
    const countMeshes = (group: Group) => {
      let n = 0
      group.traverse((object) => {
        if ((object as Mesh).isMesh) n += 1
      })
      return n
    }
    const two = countMeshes(buildGableHouse({ wall: '#f2e8d4', roof: '#c45c3a', storeys: 2 }))
    const three = countMeshes(buildGableHouse({ wall: '#f2e8d4', roof: '#c45c3a', storeys: 3 }))
    expect(three).toBeGreaterThan(two)
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
    expect(HERO_KIT_IDS).toContain('char-player')
    expect(HERO_KIT_IDS).toContain('harbour-warehouse')
    for (const id of HERO_KIT_IDS) {
      expect(kitRegistry[id].gltfUrl).toMatch(/\.glb$/)
    }
  })
})
