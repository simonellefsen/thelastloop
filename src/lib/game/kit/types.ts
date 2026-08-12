import type { Group, MeshToonMaterial, Object3D } from 'three'

/** Stable ids — do not rename without updating docs/ART_PIPELINE.md */
export type KitId =
  | 'house-cream'
  | 'house-ochre'
  | 'house-brick'
  | 'station-civic'
  | 'bakery'
  | 'depot'
  | 'home-passage'
  | 'tree-broad'
  | 'prop-bike'
  | 'prop-planter'
  | 'prop-laundry'
  | 'harbour-warehouse'
  | 'harbour-crane'
  | 'harbour-repair-workshop'
  | 'harbour-repair-boat'
  | 'harbour-tidehouse'
  | 'harbour-net-rack'
  | 'harbour-tide-shed'
  | 'harbour-rail-shed'
  | 'harbour-freight-cart'
  | 'harbour-pier-beacon'
  | 'harbour-chandlery'
  | 'harbour-sail-rack'
  | 'harbour-capstan'
  | 'moonhill-observatory'
  | 'moonhill-telescope'
  | 'moonhill-skyhouse'
  | 'moonhill-moon-dial'
  | 'moonhill-almanac-pavilion'
  | 'moonhill-star-archive'
  | 'moonhill-orrery'
  | 'moonhill-skyrail-shelter'
  | 'moonhill-baggage-trolley'
  | 'moonhill-wind-shelter'
  | 'moonhill-star-chart-table'
  | 'moonhill-meteor-marker'
  | 'moonhill-chartmaker'
  | 'moonhill-star-tea-kiosk'
  | 'char-player'
  | 'char-npc'

export interface KitCharacterOptions {
  coat: string
  hair?: string
  hat?: boolean
  hatColor?: string
  bag?: boolean
  /** Shared material so coat cycling recolors torso + arms. */
  coatMaterial?: MeshToonMaterial
}

export interface KitDefinition {
  id: KitId
  /** Optional public URL; missing file → procedural factory. */
  gltfUrl?: string
  /** Sync procedural builder used as fallback and default for P0–P2. */
  build: (options?: KitCharacterOptions) => Object3D
}

export type KitInstance = Object3D | Group
