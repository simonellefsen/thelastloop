import { buildBike, buildBroadTree, buildCharacterFigure, buildGableHouse, buildStationCivic } from './procedural'
import type { KitDefinition, KitId } from './types'
import { artPalette } from '../style'

/**
 * Kit registry — stable IDs for GameWorld placement.
 * When a glTF exists at gltfUrl, loader.ts may prefer it; until then build() is source of truth.
 */
export const kitRegistry: Record<KitId, KitDefinition> = {
  'house-cream': {
    id: 'house-cream',
    gltfUrl: '/assets/gltf/ravnbro-house-cream-01.glb',
    build: () => buildGableHouse({ wall: artPalette.cream, roof: artPalette.terracotta }),
  },
  'house-ochre': {
    id: 'house-ochre',
    gltfUrl: '/assets/gltf/ravnbro-house-ochre-01.glb',
    build: () => buildGableHouse({ wall: artPalette.ochre, roof: artPalette.terracottaDeep }),
  },
  'house-brick': {
    id: 'house-brick',
    gltfUrl: '/assets/gltf/ravnbro-house-brick-01.glb',
    build: () => buildGableHouse({ wall: artPalette.roseBrick, roof: artPalette.terracottaDeep, width: 3.0 }),
  },
  'station-civic': {
    id: 'station-civic',
    gltfUrl: '/assets/gltf/ravnbro-station.glb',
    build: () => buildStationCivic(),
  },
  bakery: {
    id: 'bakery',
    gltfUrl: '/assets/gltf/ravnbro-bakery.glb',
    build: () => buildGableHouse({
      wall: artPalette.cream,
      roof: artPalette.terracotta,
      width: 3.1,
      label: 'BAKERY',
    }),
  },
  depot: {
    id: 'depot',
    gltfUrl: '/assets/gltf/ravnbro-depot.glb',
    build: () => buildGableHouse({
      wall: artPalette.whitewash,
      roof: artPalette.terracotta,
      width: 3.4,
      bodyHeight: 1.85,
    }),
  },
  'home-passage': {
    id: 'home-passage',
    gltfUrl: '/assets/gltf/ravnbro-home-01.glb',
    build: () => buildGableHouse({
      wall: artPalette.ochre,
      roof: artPalette.terracottaDeep,
      width: 2.75,
    }),
  },
  'tree-broad': {
    id: 'tree-broad',
    gltfUrl: '/assets/gltf/tree-broad-01.glb',
    build: () => buildBroadTree(2.45),
  },
  'prop-bike': {
    id: 'prop-bike',
    gltfUrl: '/assets/gltf/prop-bike-01.glb',
    build: () => buildBike(),
  },
  'char-player': {
    id: 'char-player',
    gltfUrl: '/assets/gltf/char-player.glb',
    build: (options) => buildCharacterFigure({
      coat: options?.coat ?? artPalette.ochre,
      bag: options?.bag ?? true,
      hat: options?.hat ?? false,
      hair: options?.hair,
      coatMaterial: options?.coatMaterial,
    }),
  },
  'char-npc': {
    id: 'char-npc',
    gltfUrl: '/assets/gltf/char-npc.glb',
    build: (options) => buildCharacterFigure({
      coat: options?.coat ?? '#d25f4b',
      hat: options?.hat ?? true,
      hatColor: options?.hatColor,
      bag: options?.bag ?? false,
      coatMaterial: options?.coatMaterial,
    }),
  },
}

/** Procedural-only factory (tests / fallback). Prefer kitLoader.create in GameWorld. */
export function buildKit(id: KitId, options?: Parameters<KitDefinition['build']>[0]) {
  return kitRegistry[id].build(options)
}

export function listKitIds(): KitId[] {
  return Object.keys(kitRegistry) as KitId[]
}
