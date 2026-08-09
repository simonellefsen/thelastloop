import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import {
  addMeshOutline,
  artPalette,
  celMaterial,
  createGableRoofGeometry,
  outlineCharacter,
} from '../style'
import type { KitCharacterOptions } from './types'

function outlineMesh(mesh: Mesh, scale = 1.035): void {
  addMeshOutline(mesh, scale)
}

/** Multi-volume gable house — no single naked box. */
export function buildGableHouse(options: {
  wall: string
  roof: string
  width?: number
  bodyHeight?: number
  depth?: number
  label?: string
}): Group {
  const width = options.width ?? 2.85
  const bodyHeight = options.bodyHeight ?? 1.72
  const depth = options.depth ?? 2.15
  const building = new Group()
  const wallMat = celMaterial(options.wall)
  const roofMat = celMaterial(options.roof)
  const timber = celMaterial(artPalette.timber)
  const glass = celMaterial(artPalette.glass, { side: DoubleSide })
  const doorMat = celMaterial(artPalette.door, { side: DoubleSide })

  // Plinth so the mass sits on a visible base, not floating edges.
  const plinth = new Mesh(new BoxGeometry(width + 0.12, 0.18, depth + 0.12), celMaterial(artPalette.cobbleWarm))
  plinth.position.y = 0.09
  building.add(plinth)
  outlineMesh(plinth, 1.02)

  const body = new Mesh(new BoxGeometry(width, bodyHeight, depth), wallMat)
  body.position.y = 0.18 + bodyHeight / 2
  building.add(body)
  outlineMesh(body, 1.02)

  // Slight rear wing for multi-volume silhouette.
  const wing = new Mesh(new BoxGeometry(width * 0.55, bodyHeight * 0.72, depth * 0.45), wallMat)
  wing.position.set(width * 0.12, 0.18 + (bodyHeight * 0.72) / 2, -depth * 0.28)
  building.add(wing)
  outlineMesh(wing, 1.02)

  const eavesY = 0.18 + bodyHeight
  const roof = new Mesh(createGableRoofGeometry(width + 0.28, 0.82, depth + 0.28), roofMat)
  roof.position.y = eavesY
  building.add(roof)
  outlineMesh(roof, 1.015)

  const wingRoof = new Mesh(createGableRoofGeometry(width * 0.62, 0.48, depth * 0.55), roofMat)
  wingRoof.position.set(width * 0.12, 0.18 + bodyHeight * 0.72, -depth * 0.28)
  building.add(wingRoof)

  // Timber grid on street façade.
  const frontZ = depth / 2 + 0.02
  for (const x of [-width * 0.38, 0, width * 0.38]) {
    const upright = new Mesh(new BoxGeometry(0.1, bodyHeight + 0.08, 0.08), timber)
    upright.position.set(x, 0.18 + bodyHeight / 2, frontZ)
    building.add(upright)
  }
  for (const y of [0.55, 0.18 + bodyHeight - 0.28]) {
    const beam = new Mesh(new BoxGeometry(width + 0.06, 0.09, 0.08), timber)
    beam.position.set(0, y, frontZ)
    building.add(beam)
  }

  for (const x of [-width * 0.28, width * 0.28]) {
    const frame = new Mesh(new BoxGeometry(0.5, 0.58, 0.07), timber)
    frame.position.set(x, 0.18 + bodyHeight * 0.58, frontZ + 0.02)
    building.add(frame)
    const pane = new Mesh(new PlaneGeometry(0.36, 0.44), glass)
    pane.position.set(x, 0.18 + bodyHeight * 0.58, frontZ + 0.06)
    building.add(pane)
    // Sill
    const sill = new Mesh(new BoxGeometry(0.52, 0.05, 0.12), timber)
    sill.position.set(x, 0.18 + bodyHeight * 0.42, frontZ + 0.05)
    building.add(sill)
  }

  const doorFrame = new Mesh(new BoxGeometry(0.68, 1.05, 0.08), timber)
  doorFrame.position.set(0, 0.18 + 0.52, frontZ + 0.02)
  building.add(doorFrame)
  const door = new Mesh(new PlaneGeometry(0.52, 0.92), doorMat)
  door.position.set(0, 0.18 + 0.48, frontZ + 0.07)
  building.add(door)

  const step = new Mesh(new BoxGeometry(0.9, 0.1, 0.32), celMaterial(artPalette.cobblePale))
  step.position.set(0, 0.05, frontZ + 0.22)
  building.add(step)

  const chimney = new Mesh(new BoxGeometry(0.24, 0.62, 0.26), celMaterial(artPalette.roseBrick))
  chimney.position.set(width * 0.28, eavesY + 0.72, -depth * 0.08)
  building.add(chimney)
  outlineMesh(chimney, 1.05)

  // Flower box
  const box = new Mesh(new BoxGeometry(0.44, 0.16, 0.2), celMaterial(artPalette.timberSoft))
  box.position.set(width * 0.32, 0.7, frontZ + 0.12)
  building.add(box)
  const leaves = new Mesh(new BoxGeometry(0.4, 0.14, 0.16), celMaterial(artPalette.grassDeep))
  leaves.position.set(width * 0.32, 0.84, frontZ + 0.12)
  building.add(leaves)

  if (options.label === 'BAKERY') {
    const awning = new Mesh(new BoxGeometry(width - 0.2, 0.14, 0.55), celMaterial(artPalette.ochre))
    awning.position.set(0, 1.25, frontZ + 0.28)
    building.add(awning)
    outlineMesh(awning, 1.04)
  }

  return building
}

export function buildStationCivic(): Group {
  const station = new Group()
  const brick = celMaterial(artPalette.roseBrick)
  const darkBrick = celMaterial('#7f362f')
  const roof = celMaterial(artPalette.terracottaDeep)
  const timber = celMaterial(artPalette.timber)
  const glass = celMaterial(artPalette.glass, { side: DoubleSide })
  const door = celMaterial(artPalette.door, { side: DoubleSide })

  const plinth = new Mesh(new BoxGeometry(7.2, 0.16, 2.4), celMaterial(artPalette.cobbleWarm))
  plinth.position.y = 0.08
  station.add(plinth)

  const wing = new Mesh(new BoxGeometry(6.9, 1.52, 2.0), brick)
  wing.position.y = 0.16 + 0.76
  station.add(wing)
  outlineMesh(wing, 1.015)

  const hall = new Mesh(new BoxGeometry(2.65, 2.25, 2.25), brick)
  hall.position.y = 0.16 + 1.12
  station.add(hall)
  outlineMesh(hall, 1.015)

  // Side offices for multi-volume mass.
  for (const x of [-2.55, 2.55]) {
    const bay = new Mesh(new BoxGeometry(1.55, 1.35, 1.35), brick)
    bay.position.set(x, 0.16 + 0.68, -0.35)
    station.add(bay)
    outlineMesh(bay, 1.02)
  }

  const wingRoof = new Mesh(createGableRoofGeometry(7.25, 0.78, 2.25), roof)
  wingRoof.position.y = 0.16 + 1.52
  station.add(wingRoof)
  outlineMesh(wingRoof, 1.012)

  const hallRoof = new Mesh(createGableRoofGeometry(2.9, 1.0, 2.45), roof)
  hallRoof.position.y = 0.16 + 2.25
  station.add(hallRoof)
  outlineMesh(hallRoof, 1.015)

  for (const x of [-2.85, -1.9, -0.85, 0.85, 1.9, 2.85]) {
    const frame = new Mesh(new BoxGeometry(0.5, 0.58, 0.07), timber)
    frame.position.set(x, 0.95, 1.05)
    station.add(frame)
    const pane = new Mesh(new PlaneGeometry(0.38, 0.46), glass)
    pane.position.set(x, 0.95, 1.1)
    station.add(pane)
  }
  for (const x of [-0.55, 0.55]) {
    const frame = new Mesh(new BoxGeometry(0.42, 0.55, 0.07), timber)
    frame.position.set(x, 1.85, 1.16)
    station.add(frame)
    const pane = new Mesh(new PlaneGeometry(0.32, 0.42), glass)
    pane.position.set(x, 1.85, 1.2)
    station.add(pane)
  }

  for (const x of [-0.4, 0.4]) {
    const leaf = new Mesh(new PlaneGeometry(0.48, 0.95), door)
    leaf.position.set(x, 0.62, 1.14)
    station.add(leaf)
  }

  const canopy = new Mesh(new BoxGeometry(2.4, 0.12, 0.7), celMaterial(artPalette.cobblePale))
  canopy.position.set(0, 1.2, 1.4)
  station.add(canopy)
  outlineMesh(canopy, 1.03)

  for (const x of [-2.6, -1.0, 1.0, 2.6]) {
    const chimney = new Mesh(new BoxGeometry(0.22, 0.72, 0.24), darkBrick)
    chimney.position.set(x, 2.55, 0)
    station.add(chimney)
    outlineMesh(chimney, 1.05)
  }

  const clock = new Mesh(new CylinderGeometry(0.28, 0.28, 0.07, 14), celMaterial('#f3eed7'))
  clock.rotation.x = Math.PI / 2
  clock.position.set(0, 2.35, 1.18)
  station.add(clock)

  const forecourt = new Mesh(new CylinderGeometry(2.55, 2.85, 0.08, 14), celMaterial(artPalette.cobbleWarm))
  forecourt.position.set(0, 0.04, 1.85)
  station.add(forecourt)

  return station
}

export function buildBroadTree(height = 2.4): Group {
  const tree = new Group()
  const trunk = new Mesh(new CylinderGeometry(0.1, 0.16, height * 0.42, 7), celMaterial(artPalette.timberSoft))
  trunk.position.y = height * 0.21
  tree.add(trunk)
  outlineMesh(trunk, 1.06)

  // Soft stacked blobs instead of a cone — Messenger-adjacent crown.
  const crownMat = celMaterial(artPalette.grassDeep)
  const lightCrown = celMaterial(artPalette.grass)
  const layers = [
    { y: height * 0.55, r: height * 0.28, mat: crownMat },
    { y: height * 0.72, r: height * 0.34, mat: lightCrown },
    { y: height * 0.88, r: height * 0.26, mat: crownMat },
    { y: height * 1.02, r: height * 0.18, mat: lightCrown },
  ]
  for (const layer of layers) {
    const blob = new Mesh(new SphereGeometry(layer.r, 9, 7), layer.mat)
    blob.scale.set(1.15, 0.85, 1.1)
    blob.position.y = layer.y
    tree.add(blob)
    outlineMesh(blob, 1.025)
  }
  return tree
}

export function buildBike(): Group {
  const bike = new Group()
  const metal = celMaterial('#2c3538')
  const timber = celMaterial(artPalette.timber)
  const frame = new Mesh(new BoxGeometry(0.95, 0.06, 0.06), timber)
  frame.position.y = 0.42
  bike.add(frame)
  for (const x of [-0.34, 0.34]) {
    const wheel = new Mesh(new TorusGeometry(0.22, 0.035, 5, 12), metal)
    wheel.position.set(x, 0.24, 0)
    bike.add(wheel)
  }
  const handle = new Mesh(new BoxGeometry(0.45, 0.05, 0.05), timber)
  handle.position.set(0.4, 0.58, 0)
  bike.add(handle)
  const seat = new Mesh(new BoxGeometry(0.18, 0.06, 0.14), celMaterial(artPalette.bag))
  seat.position.set(-0.12, 0.52, 0)
  bike.add(seat)
  outlineMesh(frame, 1.05)
  return bike
}

/** A planted kerb marker with uneven foliage, used to break long street edges. */
export function buildPlanter(): Group {
  const planter = new Group()
  const wood = celMaterial(artPalette.timberSoft)
  const leaf = celMaterial(artPalette.grassDeep)
  const flower = celMaterial('#e78d72')
  const box = new Mesh(new BoxGeometry(0.52, 0.28, 0.38), wood)
  box.position.y = 0.14
  planter.add(box)
  outlineMesh(box, 1.04)
  for (const [x, z, height] of [[-0.14, -0.04, 0.3], [0.02, 0.04, 0.42], [0.16, -0.03, 0.34]] as Array<[number, number, number]>) {
    const stem = new Mesh(new ConeGeometry(0.11, height, 5), leaf)
    stem.position.set(x, 0.28 + height / 2, z)
    planter.add(stem)
    const bloom = new Mesh(new SphereGeometry(0.07, 6, 5), flower)
    bloom.position.set(x + 0.025, 0.28 + height, z)
    planter.add(bloom)
  }
  return planter
}

/** A small, colourful clothesline that makes a lane feel inhabited. */
export function buildLaundryLine(): Group {
  const laundry = new Group()
  const postMaterial = celMaterial(artPalette.timberSoft)
  const lineMaterial = celMaterial('#6a6660')
  for (const x of [-0.68, 0.68]) {
    const post = new Mesh(new CylinderGeometry(0.055, 0.045, 1.55, 6), postMaterial)
    post.position.set(x, 0.775, 0)
    laundry.add(post)
    outlineMesh(post, 1.035)
  }
  const line = new Mesh(new BoxGeometry(1.38, 0.03, 0.03), lineMaterial)
  line.position.y = 1.42
  laundry.add(line)
  for (const [x, colour, height] of [[-0.35, '#d85d67', 0.34], [0, '#f5be3e', 0.4], [0.35, '#3f8d9f', 0.31]] as Array<[number, string, number]>) {
    const cloth = new Mesh(new PlaneGeometry(0.24, height), celMaterial(colour, { side: DoubleSide }))
    cloth.position.set(x, 1.42 - height / 2, 0.025)
    laundry.add(cloth)
  }
  return laundry
}

/** Harbour Works' first street-view anchor: a working brick warehouse, not a bare box. */
export function buildHarbourWarehouse(): Group {
  const warehouse = new Group()
  const brick = celMaterial(artPalette.roseBrick)
  const roof = celMaterial('#304e55')
  const timber = celMaterial(artPalette.timber)
  const glass = celMaterial(artPalette.glass, { side: DoubleSide })
  const doorMaterial = celMaterial(artPalette.door, { side: DoubleSide })
  const body = new Mesh(new BoxGeometry(3.5, 2.05, 2.25), brick)
  body.position.y = 1.025
  warehouse.add(body)
  outlineMesh(body, 1.025)
  const roofMesh = new Mesh(createGableRoofGeometry(3.78, 0.92, 2.48), roof)
  roofMesh.position.y = 2.05
  warehouse.add(roofMesh)
  outlineMesh(roofMesh, 1.02)
  const loadingDoor = new Mesh(new PlaneGeometry(1.12, 1.24), doorMaterial)
  loadingDoor.position.set(-0.72, 0.62, 1.14)
  warehouse.add(loadingDoor)
  for (const x of [0.52, 1.2]) {
    const frame = new Mesh(new BoxGeometry(0.44, 0.54, 0.07), timber)
    frame.position.set(x, 1.15, 1.15)
    warehouse.add(frame)
    const pane = new Mesh(new PlaneGeometry(0.32, 0.4), glass)
    pane.position.set(x, 1.15, 1.195)
    warehouse.add(pane)
  }
  const loadingCanopy = new Mesh(new BoxGeometry(1.42, 0.12, 0.48), celMaterial('#d3b46d'))
  loadingCanopy.position.set(-0.72, 1.46, 1.34)
  warehouse.add(loadingCanopy)
  outlineMesh(loadingCanopy, 1.035)
  const chimney = new Mesh(new BoxGeometry(0.24, 0.7, 0.26), celMaterial('#76433c'))
  chimney.position.set(1.18, 2.55, -0.24)
  warehouse.add(chimney)
  return warehouse
}

/** A compact harbour crane with structural braces, cable and readable hook. */
export function buildHarbourCrane(): Group {
  const crane = new Group()
  const paintedMetal = celMaterial('#d57d4d')
  const iron = celMaterial('#294b51')
  const brass = celMaterial('#d9b35d')
  const base = new Mesh(new CylinderGeometry(0.45, 0.56, 0.24, 8), iron)
  base.position.y = 0.12
  crane.add(base)
  const mast = new Mesh(new BoxGeometry(0.25, 4.1, 0.25), paintedMetal)
  mast.position.y = 2.05
  crane.add(mast)
  outlineMesh(mast, 1.04)
  const arm = new Mesh(new BoxGeometry(3.4, 0.18, 0.18), paintedMetal)
  arm.position.set(-1.35, 3.82, 0)
  crane.add(arm)
  outlineMesh(arm, 1.04)
  for (const [x, y, rotation] of [[-0.55, 2.1, -0.52], [0.56, 2.3, 0.42]] as Array<[number, number, number]>) {
    const brace = new Mesh(new BoxGeometry(0.12, 2.05, 0.12), paintedMetal)
    brace.position.set(x, y, 0)
    brace.rotation.z = rotation
    crane.add(brace)
  }
  const cable = new Mesh(new CylinderGeometry(0.028, 0.028, 1.18, 6), iron)
  cable.position.set(-2.44, 3.18, 0)
  crane.add(cable)
  const hook = new Mesh(new TorusGeometry(0.15, 0.035, 5, 9, Math.PI * 1.5), brass)
  hook.rotation.z = Math.PI
  hook.position.set(-2.44, 2.53, 0)
  crane.add(hook)
  return crane
}

/** Repair Quay's small workshop, with an awning and stacked repair materials. */
export function buildHarbourRepairWorkshop(): Group {
  const workshop = new Group()
  const brick = celMaterial('#b86750')
  const slate = celMaterial('#304c54')
  const timber = celMaterial(artPalette.timber)
  const doorMaterial = celMaterial(artPalette.door, { side: DoubleSide })
  const glass = celMaterial(artPalette.glass, { side: DoubleSide })
  const body = new Mesh(new BoxGeometry(2.5, 1.65, 1.85), brick)
  body.position.y = 0.825
  workshop.add(body)
  outlineMesh(body, 1.025)
  const roof = new Mesh(createGableRoofGeometry(2.72, 0.76, 2.08), slate)
  roof.position.y = 1.65
  workshop.add(roof)
  outlineMesh(roof, 1.02)
  const door = new Mesh(new PlaneGeometry(0.92, 1.06), doorMaterial)
  door.position.set(-0.25, 0.55, 0.931)
  workshop.add(door)
  const windowFrame = new Mesh(new BoxGeometry(0.52, 0.56, 0.07), timber)
  windowFrame.position.set(0.8, 1.12, 0.94)
  workshop.add(windowFrame)
  const window = new Mesh(new PlaneGeometry(0.4, 0.42), glass)
  window.position.set(0.8, 1.12, 0.985)
  workshop.add(window)
  const awning = new Mesh(new BoxGeometry(1.38, 0.12, 0.46), celMaterial('#d3a564'))
  awning.position.set(-0.22, 1.3, 1.15)
  workshop.add(awning)
  const barrel = new Mesh(new CylinderGeometry(0.2, 0.24, 0.5, 7), celMaterial('#8a5a3c'))
  barrel.position.set(1.18, 0.25, 0.76)
  workshop.add(barrel)
  return workshop
}

/** Hauled repair boat: layered hull, cockpit, mast and visible warm patch. */
export function buildHarbourRepairBoat(): Group {
  const boat = new Group()
  const hullMaterial = celMaterial(artPalette.cream)
  const timber = celMaterial(artPalette.timber)
  const slate = celMaterial('#304c54')
  const hull = new Mesh(new BoxGeometry(2.28, 0.5, 0.92), hullMaterial)
  hull.position.y = 0.42
  boat.add(hull)
  outlineMesh(hull, 1.035)
  const keel = new Mesh(new BoxGeometry(2.4, 0.12, 0.38), timber)
  keel.position.set(0, 0.2, 0)
  boat.add(keel)
  const gunwale = new Mesh(new BoxGeometry(2.42, 0.11, 1.06), timber)
  gunwale.position.y = 0.7
  boat.add(gunwale)
  const cockpit = new Mesh(new BoxGeometry(0.78, 0.24, 0.64), slate)
  cockpit.position.set(0.22, 0.83, 0)
  boat.add(cockpit)
  const mast = new Mesh(new CylinderGeometry(0.045, 0.06, 1.45, 5), timber)
  mast.position.set(-0.5, 1.28, 0)
  boat.add(mast)
  const boom = new Mesh(new BoxGeometry(0.84, 0.05, 0.05), timber)
  boom.position.set(-0.14, 1.56, 0)
  boat.add(boom)
  const patch = new Mesh(new PlaneGeometry(0.48, 0.38), celMaterial('#d38b4f', { side: DoubleSide }))
  patch.rotation.y = Math.PI / 2
  patch.position.set(1.15, 0.52, 0)
  boat.add(patch)
  return boat
}

/** Tidehouse Row's compact working home, with a tide chart window and chimney. */
export function buildHarbourTidehouse(): Group {
  const house = new Group()
  const brick = celMaterial('#ae624b')
  const slate = celMaterial('#314f56')
  const timber = celMaterial(artPalette.timber)
  const doorMaterial = celMaterial(artPalette.door, { side: DoubleSide })
  const glass = celMaterial(artPalette.glass, { side: DoubleSide })
  const body = new Mesh(new BoxGeometry(2.22, 1.68, 1.72), brick)
  body.position.y = 0.84
  house.add(body)
  outlineMesh(body, 1.025)
  const roof = new Mesh(createGableRoofGeometry(2.44, 0.74, 1.94), slate)
  roof.position.y = 1.68
  house.add(roof)
  outlineMesh(roof, 1.02)
  const door = new Mesh(new PlaneGeometry(0.58, 0.94), doorMaterial)
  door.position.set(-0.4, 0.5, 0.868)
  house.add(door)
  const frame = new Mesh(new BoxGeometry(0.58, 0.62, 0.07), timber)
  frame.position.set(0.46, 1.0, 0.873)
  house.add(frame)
  const window = new Mesh(new PlaneGeometry(0.44, 0.48), glass)
  window.position.set(0.46, 1.0, 0.918)
  house.add(window)
  const chimney = new Mesh(new BoxGeometry(0.2, 0.22, 0.58), celMaterial('#744138'))
  chimney.position.set(0.64, 2.15, -0.2)
  house.add(chimney)
  return house
}

/** Nets drying below a canvas awning give Tidehouse Row a moving-fabric silhouette without animation. */
export function buildHarbourNetRack(): Group {
  const rack = new Group()
  const timber = celMaterial(artPalette.timber)
  const canvas = celMaterial('#d7cfa8', { side: DoubleSide })
  for (const x of [-0.84, 0.84]) {
    const post = new Mesh(new BoxGeometry(0.1, 1.62, 0.1), timber)
    post.position.set(x, 0.81, 0)
    rack.add(post)
    outlineMesh(post, 1.035)
  }
  const crossbar = new Mesh(new BoxGeometry(1.88, 0.09, 0.09), timber)
  crossbar.position.y = 1.42
  rack.add(crossbar)
  for (const [x, colour] of [[-0.48, '#d7c86f'], [0, '#5d9ba0'], [0.48, '#d7c86f']] as Array<[number, string]>) {
    const net = new Mesh(new PlaneGeometry(0.34, 0.7), celMaterial(colour, { side: DoubleSide }))
    net.position.set(x, 0.9, 0.045)
    rack.add(net)
  }
  const awning = new Mesh(new BoxGeometry(2.1, 0.1, 0.72), canvas)
  awning.position.set(0, 1.58, -0.12)
  rack.add(awning)
  return rack
}

/** Tide Yard's small net shed, layered with a tideboard and coil of rope. */
export function buildHarbourTideShed(): Group {
  const shed = new Group()
  const timber = celMaterial('#755542')
  const slate = celMaterial('#3c5559')
  const doorMaterial = celMaterial('#294b52', { side: DoubleSide })
  const tidePaint = celMaterial('#d7cfa8', { side: DoubleSide })
  const rope = celMaterial('#c7b48c')
  const body = new Mesh(new BoxGeometry(1.62, 1.32, 1.14), timber)
  body.position.y = 0.66
  shed.add(body)
  outlineMesh(body, 1.025)
  const roof = new Mesh(createGableRoofGeometry(1.88, 0.58, 1.38), slate)
  roof.position.y = 1.32
  shed.add(roof)
  outlineMesh(roof, 1.02)
  const door = new Mesh(new PlaneGeometry(0.58, 0.82), doorMaterial)
  door.position.set(-0.28, 0.45, 0.576)
  shed.add(door)
  const tideboard = new Mesh(new PlaneGeometry(0.32, 0.7), tidePaint)
  tideboard.position.set(0.48, 0.74, 0.58)
  shed.add(tideboard)
  for (const y of [0.54, 0.72, 0.9]) {
    const tick = new Mesh(new BoxGeometry(0.15, 0.025, 0.035), rope)
    tick.position.set(0.48, y, 0.603)
    shed.add(tick)
  }
  const coil = new Mesh(new TorusGeometry(0.19, 0.045, 6, 10), rope)
  coil.rotation.x = Math.PI / 2
  coil.position.set(0.76, 0.27, 0.59)
  shed.add(coil)
  return shed
}

/** Moonhill's observatory, built as an asymmetrical dome with a small study wing. */
export function buildMoonhillObservatory(): Group {
  const observatory = new Group()
  const stone = celMaterial('#d9d5bf')
  const slate = celMaterial('#424c75')
  const timber = celMaterial(artPalette.timber)
  const doorMaterial = celMaterial(artPalette.door, { side: DoubleSide })
  const glass = celMaterial(artPalette.glass, { side: DoubleSide })
  const base = new Mesh(new CylinderGeometry(2.15, 2.35, 1.7, 10), stone)
  base.position.y = 0.85
  observatory.add(base)
  outlineMesh(base, 1.02)
  const dome = new Mesh(new SphereGeometry(2.18, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), slate)
  dome.position.y = 1.72
  observatory.add(dome)
  outlineMesh(dome, 1.02)
  const wing = new Mesh(new BoxGeometry(1.25, 1.05, 1.22), stone)
  wing.position.set(-1.65, 0.53, -0.2)
  observatory.add(wing)
  const wingRoof = new Mesh(createGableRoofGeometry(1.42, 0.52, 1.4), slate)
  wingRoof.position.set(-1.65, 1.05, -0.2)
  observatory.add(wingRoof)
  const door = new Mesh(new PlaneGeometry(0.72, 1.05), doorMaterial)
  door.position.set(0, 0.58, 2.18)
  observatory.add(door)
  const windowFrame = new Mesh(new BoxGeometry(0.56, 0.64, 0.07), timber)
  windowFrame.position.set(-1.65, 0.7, 0.43)
  observatory.add(windowFrame)
  const window = new Mesh(new PlaneGeometry(0.42, 0.48), glass)
  window.position.set(-1.65, 0.7, 0.47)
  observatory.add(window)
  const slit = new Mesh(new BoxGeometry(0.14, 0.62, 0.1), celMaterial('#d9c777'))
  slit.position.set(0.2, 3.12, 0.82)
  slit.rotation.z = -0.22
  observatory.add(slit)
  return observatory
}

/** Moonhill's quest telescope. The `Lens` mesh is intentionally runtime-tintable. */
export function buildMoonhillTelescope(): Group {
  const telescope = new Group()
  const violet = celMaterial('#6d5b8a')
  const paleMetal = celMaterial('#d9d3e9')
  const brass = celMaterial('#c9a467')
  const pedestal = new Mesh(new CylinderGeometry(0.3, 0.47, 1.18, 7), violet)
  pedestal.position.y = 0.59
  telescope.add(pedestal)
  outlineMesh(pedestal, 1.05)
  const cradle = new Mesh(new BoxGeometry(0.64, 0.15, 0.38), brass)
  cradle.position.set(0.3, 1.22, 0)
  cradle.rotation.z = Math.PI / 3.1
  telescope.add(cradle)
  const tube = new Mesh(new CylinderGeometry(0.18, 0.28, 2.2, 8), paleMetal)
  tube.rotation.z = Math.PI / 3.1
  tube.position.set(0.68, 1.5, 0)
  telescope.add(tube)
  outlineMesh(tube, 1.05)
  const lens = new Mesh(new SphereGeometry(0.22, 8, 6), celMaterial('#8975bc'))
  lens.name = 'Lens'
  lens.position.set(1.28, 1.94, 0)
  telescope.add(lens)
  return telescope
}

/** Comet Walk's lookout house, with a weather vane and warm survey window. */
export function buildMoonhillSkyhouse(): Group {
  const skyhouse = new Group()
  const wall = celMaterial('#687977')
  const slate = celMaterial('#3d496d')
  const timber = celMaterial(artPalette.timber)
  const brass = celMaterial('#c9a566')
  const doorMaterial = celMaterial(artPalette.door, { side: DoubleSide })
  const glass = celMaterial(artPalette.glass, { side: DoubleSide })
  const body = new Mesh(new BoxGeometry(1.9, 1.45, 1.48), wall)
  body.position.y = 0.725
  skyhouse.add(body)
  outlineMesh(body, 1.025)
  const roof = new Mesh(createGableRoofGeometry(2.14, 0.74, 1.72), slate)
  roof.position.y = 1.45
  skyhouse.add(roof)
  outlineMesh(roof, 1.02)
  const door = new Mesh(new PlaneGeometry(0.58, 0.88), doorMaterial)
  door.position.set(-0.3, 0.47, 0.746)
  skyhouse.add(door)
  const frame = new Mesh(new BoxGeometry(0.5, 0.54, 0.07), timber)
  frame.position.set(0.43, 0.94, 0.75)
  skyhouse.add(frame)
  const window = new Mesh(new PlaneGeometry(0.36, 0.4), glass)
  window.position.set(0.43, 0.94, 0.795)
  skyhouse.add(window)
  const vanePost = new Mesh(new CylinderGeometry(0.035, 0.045, 0.92, 5), brass)
  vanePost.position.set(0.15, 2.0, 0)
  skyhouse.add(vanePost)
  const vane = new Mesh(new BoxGeometry(0.76, 0.045, 0.09), brass)
  vane.position.set(0.15, 2.38, 0)
  vane.rotation.y = -0.32
  skyhouse.add(vane)
  return skyhouse
}

/** Almanac Garden's moon dial; the prominent gnomon reads at a phone-sized distance. */
export function buildMoonhillMoonDial(): Group {
  const dial = new Group()
  const stone = celMaterial('#d9d3bd')
  const face = celMaterial('#e4dfc5')
  const brass = celMaterial('#c9a467')
  const base = new Mesh(new CylinderGeometry(0.8, 0.92, 0.2, 10), stone)
  base.position.y = 0.1
  dial.add(base)
  outlineMesh(base, 1.03)
  const dialFace = new Mesh(new CylinderGeometry(0.62, 0.62, 0.06, 10), face)
  dialFace.position.y = 0.23
  dial.add(dialFace)
  const gnomon = new Mesh(new ConeGeometry(0.08, 0.76, 5), brass)
  gnomon.position.set(0, 0.61, 0)
  gnomon.rotation.z = -0.28
  dial.add(gnomon)
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const marker = new Mesh(new BoxGeometry(0.09, 0.05, 0.23), brass)
    marker.position.set(Math.sin(angle) * 0.43, 0.29, Math.cos(angle) * 0.43)
    dial.add(marker)
  }
  return dial
}

/** Small almanac pavilion with an open threshold and oversized weather vane. */
export function buildMoonhillAlmanacPavilion(): Group {
  const pavilion = new Group()
  const wall = celMaterial('#657775')
  const slate = celMaterial('#414d71')
  const brass = celMaterial('#c9a467')
  const doorMaterial = celMaterial(artPalette.door, { side: DoubleSide })
  const body = new Mesh(new BoxGeometry(1.7, 1.28, 1.34), wall)
  body.position.y = 0.64
  pavilion.add(body)
  outlineMesh(body, 1.025)
  const roof = new Mesh(createGableRoofGeometry(1.94, 0.68, 1.58), slate)
  roof.position.y = 1.28
  pavilion.add(roof)
  outlineMesh(roof, 1.02)
  const door = new Mesh(new PlaneGeometry(0.52, 0.76), doorMaterial)
  door.position.set(-0.3, 0.42, 0.676)
  pavilion.add(door)
  const vanePost = new Mesh(new CylinderGeometry(0.035, 0.045, 0.92, 5), brass)
  vanePost.position.set(0, 2.0, 0)
  pavilion.add(vanePost)
  const vane = new Mesh(new BoxGeometry(0.72, 0.05, 0.08), brass)
  vane.position.set(0, 2.35, 0)
  pavilion.add(vane)
  return pavilion
}

/** Archive Terrace's small record house, with an oversized star window. */
export function buildMoonhillStarArchive(): Group {
  const archive = new Group()
  const wall = celMaterial('#6e7c7a')
  const slate = celMaterial('#404c72')
  const timber = celMaterial('#665047')
  const doorMaterial = celMaterial('#314f59', { side: DoubleSide })
  const glass = celMaterial(artPalette.glass, { side: DoubleSide })
  const body = new Mesh(new BoxGeometry(1.78, 1.38, 1.44), wall)
  body.position.y = 0.69
  archive.add(body)
  outlineMesh(body, 1.025)
  const roof = new Mesh(createGableRoofGeometry(2.04, 0.63, 1.64), slate)
  roof.position.y = 1.38
  archive.add(roof)
  outlineMesh(roof, 1.02)
  const door = new Mesh(new PlaneGeometry(0.54, 0.86), doorMaterial)
  door.position.set(-0.32, 0.46, 0.726)
  archive.add(door)
  const frame = new Mesh(new BoxGeometry(0.48, 0.5, 0.07), timber)
  frame.position.set(0.43, 0.9, 0.73)
  archive.add(frame)
  const window = new Mesh(new PlaneGeometry(0.34, 0.36), glass)
  window.position.set(0.43, 0.9, 0.775)
  archive.add(window)
  const star = new Mesh(new SphereGeometry(0.07, 6, 5), celMaterial('#d4b669'))
  star.position.set(0.43, 0.9, 0.81)
  archive.add(star)
  const recordBox = new Mesh(new BoxGeometry(0.38, 0.26, 0.3), timber)
  recordBox.position.set(0.7, 0.13, 0.74)
  archive.add(recordBox)
  return archive
}

/** Archive Terrace's brass orrery, designed to read from the high road. */
export function buildMoonhillOrrery(): Group {
  const orrery = new Group()
  const stone = celMaterial('#a9a294')
  const brass = celMaterial('#c8a363')
  const sun = celMaterial('#f0d674')
  const moon = celMaterial('#d8e3df')
  const plinth = new Mesh(new CylinderGeometry(0.46, 0.58, 0.68, 8), stone)
  plinth.position.y = 0.34
  orrery.add(plinth)
  outlineMesh(plinth, 1.03)
  const ringOne = new Mesh(new TorusGeometry(0.72, 0.045, 6, 16), brass)
  ringOne.rotation.x = Math.PI / 2.8
  ringOne.position.y = 1.0
  orrery.add(ringOne)
  const ringTwo = new Mesh(new TorusGeometry(0.5, 0.04, 6, 14), brass)
  ringTwo.rotation.z = Math.PI / 2.7
  ringTwo.position.y = 1.0
  orrery.add(ringTwo)
  const sunMesh = new Mesh(new SphereGeometry(0.14, 7, 6), sun)
  sunMesh.position.y = 1.0
  orrery.add(sunMesh)
  const moonMesh = new Mesh(new SphereGeometry(0.08, 6, 5), moon)
  moonMesh.position.set(0.61, 1.14, 0)
  orrery.add(moonMesh)
  return orrery
}

/** Readable third-person character — shared by player and NPCs. */
export function buildCharacterFigure(options: KitCharacterOptions): Group {
  const figure = new Group()
  const skin = celMaterial(artPalette.skin)
  const coatMaterial = options.coatMaterial ?? celMaterial(options.coat)
  const hatColor = options.hatColor ?? '#314955'
  const legMaterial = celMaterial('#2a3338')
  const sockMaterial = celMaterial(artPalette.sock)
  const shoeMaterial = celMaterial(artPalette.shoe)

  // Hips block so legs and torso connect cleanly.
  const hips = new Mesh(new BoxGeometry(0.42, 0.18, 0.28), legMaterial)
  hips.position.y = 0.48
  figure.add(hips)

  for (const side of [-1, 1] as const) {
    const thigh = new Mesh(new CylinderGeometry(0.095, 0.11, 0.32, 7), legMaterial)
    thigh.position.set(side * 0.12, 0.34, 0.02)
    figure.add(thigh)
    const calf = new Mesh(new CylinderGeometry(0.08, 0.095, 0.28, 7), legMaterial)
    calf.position.set(side * 0.12, 0.14, 0.03)
    figure.add(calf)
    const sock = new Mesh(new CylinderGeometry(0.082, 0.088, 0.12, 7), sockMaterial)
    sock.position.set(side * 0.12, 0.08, 0.04)
    figure.add(sock)
    const shoe = new Mesh(new BoxGeometry(0.15, 0.09, 0.26), shoeMaterial)
    shoe.position.set(side * 0.12, 0.035, 0.07)
    figure.add(shoe)
  }

  const torso = new Mesh(new CylinderGeometry(0.26, 0.34, 0.58, 9), coatMaterial)
  torso.position.y = 0.82
  figure.add(torso)
  // Soft shoulder volume
  const shoulders = new Mesh(new BoxGeometry(0.72, 0.16, 0.32), coatMaterial)
  shoulders.position.y = 1.05
  figure.add(shoulders)

  for (const side of [-1, 1] as const) {
    const upper = new Mesh(new CylinderGeometry(0.07, 0.085, 0.32, 7), coatMaterial)
    upper.position.set(side * 0.36, 0.88, 0)
    upper.rotation.z = side * 0.2
    figure.add(upper)
    const lower = new Mesh(new CylinderGeometry(0.065, 0.075, 0.28, 7), coatMaterial)
    lower.position.set(side * 0.42, 0.58, 0.02)
    lower.rotation.z = side * 0.12
    figure.add(lower)
    const hand = new Mesh(new SphereGeometry(0.075, 7, 6), skin)
    hand.position.set(side * 0.44, 0.42, 0.04)
    figure.add(hand)
  }

  const neck = new Mesh(new CylinderGeometry(0.08, 0.1, 0.1, 7), skin)
  neck.position.y = 1.18
  figure.add(neck)
  const head = new Mesh(new SphereGeometry(0.23, 11, 9), skin)
  head.position.y = 1.38
  figure.add(head)

  if (options.hat) {
    const brim = new Mesh(new CylinderGeometry(0.34, 0.34, 0.05, 12), celMaterial(hatColor))
    brim.position.y = 1.54
    figure.add(brim)
    const crown = new Mesh(new CylinderGeometry(0.2, 0.22, 0.2, 12), celMaterial(hatColor))
    crown.position.y = 1.66
    figure.add(crown)
  } else {
    const hair = new Mesh(new SphereGeometry(0.26, 11, 9), celMaterial(options.hair ?? artPalette.hair))
    hair.scale.set(1.08, 0.88, 1.12)
    hair.position.set(0, 1.46, -0.03)
    figure.add(hair)
    const fringe = new Mesh(new BoxGeometry(0.4, 0.12, 0.14), celMaterial(options.hair ?? artPalette.hair))
    fringe.position.set(0, 1.42, 0.16)
    figure.add(fringe)
    // Side volume for bob cut from behind
    for (const side of [-1, 1] as const) {
      const sideHair = new Mesh(new SphereGeometry(0.12, 8, 6), celMaterial(options.hair ?? artPalette.hair))
      sideHair.position.set(side * 0.2, 1.32, 0.02)
      figure.add(sideHair)
    }
  }

  if (options.bag !== false) {
    const bag = new Mesh(new BoxGeometry(0.26, 0.36, 0.14), celMaterial(artPalette.bag))
    bag.position.set(0.3, 0.88, 0.1)
    figure.add(bag)
    const strap = new Mesh(new BoxGeometry(0.05, 0.58, 0.04), celMaterial(artPalette.bag))
    strap.position.set(0.14, 1.12, 0.02)
    strap.rotation.z = -0.55
    figure.add(strap)
  }

  outlineCharacter(figure, 1.065)
  return figure
}

/** Tiny decorative cone residual for title atlas only — prefer buildBroadTree in streets. */
export function buildConeTreeLegacy(): Group {
  const tree = new Group()
  const trunk = new Mesh(new CylinderGeometry(0.1, 0.15, 1.05, 5), celMaterial('#6b5041'))
  trunk.position.y = 0.52
  tree.add(trunk)
  const crown = new Mesh(new ConeGeometry(0.95, 1.8, 6), celMaterial(artPalette.grassDeep))
  crown.position.y = 1.7
  tree.add(crown)
  return tree
}
