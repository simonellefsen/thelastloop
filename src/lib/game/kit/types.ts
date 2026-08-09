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
