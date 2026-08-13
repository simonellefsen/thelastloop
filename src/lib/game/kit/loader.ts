import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshToonMaterial,
  type Material,
  type Object3D,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { addMeshOutline, celMaterial, getOutlineMaterial } from '../style'
import { kitRegistry } from './registry'
import type { KitCharacterOptions, KitId } from './types'

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
    const definition = kitRegistry[id]
    const url = definition.gltfUrl
    const isCharacter = id === 'char-player' || id === 'char-npc'
    if (url && this.cache.has(url)) {
      const instance = this.cache.get(url)!.clone(true)
      if (isCharacter) applyCharacterStyle(instance, options)
      if (isCharacter) markCameraPassThrough(instance)
      return instance
    }
    const built = definition.build(options)
    if (isCharacter) markCameraPassThrough(built)
    return built
  }

  isLoaded(id: KitId): boolean {
    const url = kitRegistry[id].gltfUrl
    return Boolean(url && this.cache.has(url))
  }

  private async loadGltf(id: KitId): Promise<void> {
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

/**
 * Characters must never block the follow camera.
 *
 * The station keeper is added straight to its district group rather than to a
 * `streetLife` group, so the camera's occlusion ray treated a person standing in
 * the street as a building: the guard hauled the camera in to escape them and
 * parked it inside their head. Tag every character kit — however it is placed —
 * and let the camera pass through it. See docs/MESSENGER_ROADMAP.md M0.4.
 */
export function markCameraPassThrough(object: Object3D): void {
  object.userData.cameraPassThrough = true
}

/** True when `object` or any ancestor is tagged to let the camera pass through. */
export function isCameraPassThrough(object: Object3D | null): boolean {
  let node: Object3D | null = object
  while (node) {
    if (node.userData?.cameraPassThrough) return true
    node = node.parent
  }
  return false
}

/**
 * Blender character meshes label their changeable parts by role. Each clone
 * receives its own non-coat materials, while the player coat may deliberately
 * reuse GameWorld's shared material for the wardrobe control.
 */
function applyCharacterStyle(root: Object3D, options?: KitCharacterOptions): void {
  root.traverse((object) => {
    if (!(object as Mesh).isMesh) return
    const mesh = object as Mesh
    const name = mesh.name.toLowerCase()
    if (name.startsWith('coat')) {
      mesh.material = options?.coatMaterial ?? celMaterial(options?.coat ?? '#d25f4b')
      return
    }
    if (name.startsWith('hair') && options?.hair) {
      mesh.material = celMaterial(options.hair)
      return
    }
    if (name.startsWith('hat')) {
      mesh.visible = options?.hat !== false
      if (options?.hatColor) mesh.material = celMaterial(options.hatColor)
      return
    }
    if (name.startsWith('bag')) {
      mesh.visible = options?.bag !== false
      return
    }
    // clone(true) shares material instances, so mutable local materials must
    // be copied before any future instance-specific styling.
    if (mesh.material instanceof MeshToonMaterial) mesh.material = mesh.material.clone()
  })
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
  'prop-planter',
  'prop-laundry',
  'harbour-warehouse',
  'harbour-crane',
  'harbour-repair-workshop',
  'harbour-repair-boat',
  'harbour-tidehouse',
  'harbour-net-rack',
  'harbour-tide-shed',
  'harbour-rail-shed',
  'harbour-freight-cart',
  'harbour-pier-beacon',
  'harbour-chandlery',
  'harbour-sail-rack',
  'harbour-capstan',
  'moonhill-observatory',
  'moonhill-telescope',
  'moonhill-skyhouse',
  'moonhill-moon-dial',
  'moonhill-almanac-pavilion',
  'moonhill-star-archive',
  'moonhill-orrery',
  'moonhill-skyrail-shelter',
  'moonhill-baggage-trolley',
  'moonhill-wind-shelter',
  'moonhill-star-chart-table',
  'moonhill-meteor-marker',
  'moonhill-chartmaker',
  'moonhill-star-tea-kiosk',
  'char-player',
  'char-npc',
]

export const kitLoader = new KitLoader()
