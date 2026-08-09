import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
  type Object3D,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { addMeshOutline, celMaterial, getOutlineMaterial } from '../style'
import { kitRegistry } from './registry'
import type { KitCharacterOptions, KitId } from './types'

/** Kits that keep procedural builds (coat colour / per-instance options). */
const PROCEDURAL_ONLY: ReadonlySet<KitId> = new Set(['char-player', 'char-npc'])

/**
 * glTF cache with procedural fallback.
 * Call `preload([...])` before GameWorld construction so create() hits the cache.
 */
export class KitLoader {
  private readonly loader = new GLTFLoader()
  private readonly cache = new Map<string, Object3D>()
  private readonly failed = new Set<string>()

  async preload(ids: KitId[]): Promise<void> {
    await Promise.all(ids.map((id) => this.loadGltf(id)))
  }

  /** Prefer cached glTF clone; otherwise procedural build. */
  create(id: KitId, options?: KitCharacterOptions): Object3D {
    if (PROCEDURAL_ONLY.has(id)) {
      return kitRegistry[id].build(options)
    }
    const definition = kitRegistry[id]
    const url = definition.gltfUrl
    if (url && this.cache.has(url)) {
      return this.cache.get(url)!.clone(true)
    }
    return definition.build(options)
  }

  isLoaded(id: KitId): boolean {
    const url = kitRegistry[id].gltfUrl
    return Boolean(url && this.cache.has(url))
  }

  private async loadGltf(id: KitId): Promise<void> {
    if (PROCEDURAL_ONLY.has(id)) return
    const definition = kitRegistry[id]
    const url = definition.gltfUrl
    if (!url || this.cache.has(url) || this.failed.has(url)) return
    try {
      const gltf = await this.loader.loadAsync(url)
      const root = new Group()
      root.name = `kit:${id}`
      root.add(gltf.scene)
      restyleGltfToCel(root)
      this.cache.set(url, root)
    } catch {
      this.failed.add(url)
    }
  }
}

/** Convert Blender Principled materials to project cel look + ink outlines. */
export function restyleGltfToCel(root: Object3D): void {
  root.traverse((object) => {
    if (!(object as Mesh).isMesh) return
    const mesh = object as Mesh
    if (mesh.material === getOutlineMaterial()) return

    const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const next = sources.map((material) => toCelMaterial(material))
    mesh.material = next.length === 1 ? next[0] : next

    // Avoid double outlines if clone is restyled again
    if (!mesh.children.some((child) => (child as Mesh).isMesh && (child as Mesh).material === getOutlineMaterial())) {
      addMeshOutline(mesh, 1.03)
    }
  })
}

function toCelMaterial(material: Material) {
  let hex = '#cccccc'
  if ('color' in material && material.color instanceof Color) {
    hex = `#${material.color.getHexString()}`
  } else if (material instanceof MeshStandardMaterial) {
    hex = `#${material.color.getHexString()}`
  }
  const cel = celMaterial(hex)
  if ('transparent' in material && material.transparent) {
    cel.transparent = true
    cel.opacity = 'opacity' in material ? Number(material.opacity) : 1
  }
  if ('side' in material && material.side !== undefined) {
    cel.side = material.side
  }
  return cel
}

/** Hero corridor set — matches public/assets/gltf exports from Blender. */
export const HERO_KIT_IDS: KitId[] = [
  'house-cream',
  'house-ochre',
  'house-brick',
  'station-civic',
  'bakery',
  'depot',
  'home-passage',
  'tree-broad',
  'prop-bike',
]

export const kitLoader = new KitLoader()
