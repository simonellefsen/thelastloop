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
