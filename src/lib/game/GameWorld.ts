import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { entryCameraProfile } from './camera'
import { gentleStreetHeight, isOutsideSphericalBlockers, isWithinWalkableCap, tangentForward } from './math'
import { nextPassengerIdentity } from './presence'
import { animationTime, shouldRender } from './runtime'
import { advanceSideQuest, defaultQuest, resolveClue, unlockHarbour, unlockObservatory } from './quest'
import { coatColors, nextCoatColor } from './style'
import { Soundscape, soundscapeProfile } from './soundscape'
import { readSave, writeSave } from './storage'
import type { SphericalBlocker } from './math'
import type { ClueId, DistrictId, GameHud, GameSave, PlayerController, SideQuestId, WorldInteractable } from './types'

const UP = new Vector3(0, 1, 0)
const PLANET_RADIUS = 10
const WALKABLE_ANCHOR = new Vector3(0, 1, 0)
const WALKABLE_ANGLE = 0.82

export interface GameWorldEvents {
  onHud(hud: GameHud): void
  onSound(enabled: boolean): void
  onError(message: string): void
}

interface Clue extends WorldInteractable {
  id: ClueId
  text: string
  mesh: Object3D
}

type SideMarkerId = 'lens-cache' | 'signal-repair' | 'tune-card' | 'bell-chime' | 'harbour-valve' | 'harbour-pump' | 'observatory-lens' | 'observatory-scope'

interface SideMarker extends WorldInteractable {
  id: SideMarkerId
  sideQuest: SideQuestId
  requiredStage: 'first' | 'second'
  district: DistrictId
  text: string
  mesh: Object3D
}

export class GameWorld implements PlayerController {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(40, 1, 0.1, 120)
  private readonly root = new Group()
  private readonly hillsideStreet = new Group()
  private readonly harbourWorld = new Group()
  private readonly observatoryWorld = new Group()
  private readonly player = new Group()
  private readonly stationInterior = new Group()
  private readonly ground: Mesh
  private harbourGround: Mesh | undefined
  private observatoryGround: Mesh | undefined
  private readonly raycaster = new Raycaster()
  private readonly clock = { last: performance.now(), elapsed: 0 }
  private readonly keys = new Set<string>()
  private readonly clues: Clue[] = []
  private readonly streetClues: Clue[] = []
  private readonly sideMarkers: SideMarker[] = []
  private readonly streetSideMarkers: SideMarker[] = []
  private readonly blockersByDistrict: Record<DistrictId, SphericalBlocker[]> = { hillside: [], harbour: [], observatory: [] }
  private readonly streetBlockers: Array<{ center: Vector3; radius: number }> = []
  private readonly ambient = new Group()
  private readonly harbourAmbient = new Group()
  private readonly streetLife = new Group()
  private readonly resizeObserver: ResizeObserver
  private readonly onKeyDown = (event: KeyboardEvent) => this.keys.add(event.key.toLowerCase())
  private readonly onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase())
  private readonly onResize = () => this.resize()
  private readonly onVisibilityChange = () => this.handleVisibilityChange()
  private currentNormal = new Vector3()
  private streetPosition = new Vector3(0, 0, 7.4)
  private streetForward = new Vector3(0, 0, -1)
  private playerForward = new Vector3(0, 0, -1)
  private joystick = new Vector2()
  private started = false
  private animationFrame = 0
  private entryCameraProgress = 1
  private nearby: Clue | SideMarker | 'station-keeper' | 'station-door' | undefined
  private stationSign: Sprite | undefined
  private streetStationSign: Sprite | undefined
  private stationDoorPosition = new Vector3()
  private streetStationDoorPosition = new Vector3(0, 0, 0.9)
  private playerCoat: MeshLambertMaterial | undefined
  private signalBulb: MeshLambertMaterial | undefined
  private streetSignalBulb: MeshLambertMaterial | undefined
  private streetBellGlow: MeshLambertMaterial | undefined
  private harbourBeacon: MeshLambertMaterial | undefined
  private observatoryBeacon: MeshLambertMaterial | undefined
  private readonly chorusFireflies = new Group()
  private readonly streetChorusFireflies = new Group()
  private save: GameSave
  private soundscape: Soundscape
  private inStation = false
  private displayedHint = ''
  private displayedDialogue = ''

  constructor(private readonly container: HTMLElement, private readonly events: GameWorldEvents) {
    this.save = readSave(window.localStorage)
    this.currentNormal.fromArray(this.save.playerNormal).normalize()
    this.soundscape = new Soundscape(this.save.soundEnabled)

    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65))
    this.renderer.outputColorSpace = 'srgb'
    this.renderer.domElement.setAttribute('aria-hidden', 'true')
    container.appendChild(this.renderer.domElement)

    this.scene.background = new Color('#65c7c3')
    this.scene.fog = new Fog('#65c7c3', 26, 67)
    this.scene.add(this.root)
    this.scene.add(new HemisphereLight('#d8fff0', '#2c6269', 2.6))
    this.scene.add(new AmbientLight('#fff1cf', 0.6))
    const sun = new DirectionalLight('#fff3bd', 3.5)
    sun.position.set(8, 14, 6)
    this.scene.add(sun)

    this.ground = this.createWorld()
    this.createHillsideStreetWorld()
    this.createPlayer()
    this.createHarbourWorld()
    this.createObservatoryWorld()
    this.createStationInterior()
    this.createAmbientLife()
    this.resize()
    this.resizeObserver = new ResizeObserver(this.onResize)
    this.resizeObserver.observe(container)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.emitHud('Enter the town when you are ready.', 'A small world remembers every path.')
    this.tick()
  }

  getSoundEnabled(): boolean {
    return this.save.soundEnabled
  }

  setTitlePreview(district: DistrictId): void {
    if (this.started) return
    this.hillsideStreet.visible = false
    this.root.visible = district === 'hillside'
    this.ambient.visible = district === 'hillside'
    this.harbourWorld.visible = district === 'harbour'
    this.harbourAmbient.visible = district === 'harbour'
    this.observatoryWorld.visible = district === 'observatory'
  }

  start(): void {
    this.setTitlePreview(this.save.district)
    this.started = true
    this.entryCameraProgress = 0
    this.save.quest.introductionSeen = true
    this.persist()
    this.soundscape.start(soundscapeProfile(this.save.quest))
    if (this.save.district === 'harbour') {
      this.showHarbour(false)
      this.emitHud('The tide clock is still waiting at Harbour Works.', 'Find the blue valve, then return it to the dock pump.')
      return
    }
    if (this.save.district === 'observatory') {
      this.showObservatory(false)
      this.emitHud('Moonhill is quiet beneath the stars.', 'Find the starlight lens, then align the telescope.')
      return
    }
    this.enterHillsideStreet()
    this.emitHud('Find three fragments of the station name.', 'Follow the amber beacons and tap Investigate when the button appears.')
  }

  setJoystick(input: { x: number; y: number }): void {
    this.joystick.set(input.x, input.y)
  }

  interact(): void {
    if (!this.started || !this.nearby) return
    this.playTone(this.nearby === 'station-keeper' || this.nearby === 'station-door' ? 392 : 523)
    if (this.nearby === 'station-door') {
      this.enterStation()
      return
    }
    if (this.nearby === 'station-keeper') {
      if (this.save.quest.stationNameRestored && (this.save.quest.lantern !== 'complete' || this.save.quest.chorus !== 'complete')) this.emitHud('Sunset Loop has a name again, but the signal is dark and the hill has forgotten its song.', 'Follow the teal and rose markers for two small side routes.')
      else if (this.save.quest.stationNameRestored) this.emitHud('The station is bright, the birds are singing, and a short train is ready for Harbour Works.', 'Walk to the blue station door to enter.')
      else this.emitHud('The old sign is blank again. The town kept its name in three little stories.', 'Look for the signal box, market mural and hill bell.')
      return
    }

    if ('sideQuest' in this.nearby) {
      this.resolveSideMarker(this.nearby)
      return
    }

    const clue = this.nearby
    if (this.save.quest.completedClues.includes(clue.id)) {
      this.emitHud('You have already held on to this piece of the name.', 'Find the remaining amber markers.')
      return
    }
    this.save.quest = resolveClue(this.save.quest, clue.id)
    clue.mesh.visible = false
    const quest = this.save.quest
    if (quest.stationNameRestored) {
      this.setStationSign('SUNSET LOOP', '#f8d34e')
      this.updateSideQuestMarkers()
      this.soundscape.setProfile(soundscapeProfile(this.save.quest))
      this.playTone(784)
      this.emitHud('The painted letters return: SUNSET LOOP. Somewhere far below, an old train answers.', 'The first route is restored.')
    } else {
      this.emitHud(clue.text, `${3 - quest.completedClues.length} fragment${3 - quest.completedClues.length === 1 ? '' : 's'} remain.`)
    }
    this.persist()
  }

  toggleSound(): void {
    this.save.soundEnabled = !this.save.soundEnabled
    this.persist()
    this.events.onSound(this.save.soundEnabled)
    this.soundscape.setEnabled(this.save.soundEnabled)
    if (this.save.soundEnabled) this.playTone(660)
  }

  leaveStation(): void {
    if (!this.inStation) return
    this.inStation = false
    this.stationInterior.visible = false
    this.enterHillsideStreet()
    this.save.district = 'hillside'
    this.soundscape.setProfile(soundscapeProfile(this.save.quest))
    this.emitHud('The route map now leads to Harbour Works.', 'Moonhill Observatory is still waiting for its story.')
  }

  cycleCoat(): void {
    this.save.coatColor = nextCoatColor(this.save.coatColor)
    this.playerCoat?.color.set(coatColors[this.save.coatColor])
    this.persist()
    this.playTone(587)
    this.emitHud(`Railway coat changed to ${this.save.coatColor}.`, 'A little colour makes a long route feel like your own.')
  }

  cyclePassengerIdentity(): void {
    this.save.identity = nextPassengerIdentity(this.save.identity)
    this.persist()
    this.playTone(494)
    this.emitHud(`Passenger pass changed to ${this.save.identity.callsign}.`, 'This callsign stays on this device until shared rooms arrive.')
  }

  travelToHarbour(): void {
    if (!this.inStation || !this.save.quest.stationNameRestored) return
    const firstVisit = this.save.quest.harbour === 'locked'
    this.save.quest = unlockHarbour(this.save.quest)
    this.showHarbour(firstVisit)
    this.persist()
    this.playTone(554)
    this.emitHud(firstVisit ? 'The old loop carries you down to Harbour Works. The tide clock has stopped.' : 'Harbour Works is waiting by the water.', firstVisit ? 'Find the blue valve, then return it to the dock pump.' : 'Follow the blue marker if the tide clock still needs help.')
  }

  travelToObservatory(): void {
    if (!this.inStation || !this.save.quest.stationNameRestored) return
    const firstVisit = this.save.quest.observatory === 'locked'
    this.save.quest = unlockObservatory(this.save.quest)
    this.showObservatory(firstVisit)
    this.persist()
    this.playTone(622)
    this.emitHud(firstVisit ? 'The loop climbs to Moonhill. Its telescope has lost the moon signal.' : 'Moonhill Observatory is still listening for the signal.', firstVisit ? 'Find the starlight lens, then align the telescope.' : 'Follow the violet marker if the telescope still needs help.')
  }

  returnToStation(): void {
    if (this.save.district === 'hillside') return
    const leavingObservatory = this.save.district === 'observatory'
    ;(leavingObservatory ? this.observatoryWorld : this.harbourWorld).remove(this.player)
    this.root.add(this.player)
    this.harbourWorld.visible = false
    this.harbourAmbient.visible = false
    this.observatoryWorld.visible = false
    this.root.visible = false
    this.ambient.visible = false
    this.player.visible = false
    this.stationInterior.visible = true
    this.inStation = true
    this.save.district = 'hillside'
    this.currentNormal.copy(this.normalAt(0.38, -0.42))
    this.soundscape.setProfile(soundscapeProfile(this.save.quest, true))
    this.persist()
    this.emitHud('The little train returns you to Sunset Loop.', 'Harbour Works and Moonhill are now part of the same small circle.')
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver.disconnect()
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.soundscape.dispose()
    this.renderer.dispose()
    this.container.replaceChildren()
  }

  private createWorld(): Mesh {
    const ocean = new Mesh(
      new SphereGeometry(PLANET_RADIUS - 0.2, 40, 28),
      new MeshStandardMaterial({ color: '#3c9da2', roughness: 0.9, metalness: 0 }),
    )
    this.root.add(ocean)

    const ground = new Mesh(
      new SphereGeometry(PLANET_RADIUS, 40, 28, 0, Math.PI * 2, 0, 1.7),
      new MeshLambertMaterial({ color: '#75a969', flatShading: true }),
    )
    this.root.add(ground)

    const rim = new Mesh(
      new TorusGeometry(8.3, 0.12, 6, 72),
      new MeshLambertMaterial({ color: '#394c45', flatShading: true }),
    )
    rim.rotation.x = Math.PI / 2
    rim.position.y = -0.7
    this.root.add(rim)
    this.addRailLoop()
    this.addDistrict()
    return ground
  }

  private createHillsideStreetWorld(): void {
    this.hillsideStreet.visible = false
    const groundGeometry = new PlaneGeometry(42, 38, 24, 20)
    const groundPositions = groundGeometry.getAttribute('position')
    for (let index = 0; index < groundPositions.count; index += 1) {
      groundPositions.setZ(index, gentleStreetHeight(groundPositions.getX(index), -groundPositions.getY(index)))
    }
    groundGeometry.computeVertexNormals()
    const ground = new Mesh(groundGeometry, new MeshLambertMaterial({ color: '#79bd68', flatShading: true, side: DoubleSide }))
    ground.rotation.x = -Math.PI / 2
    this.hillsideStreet.add(ground)

    const road = this.createRollingStreetSurface(4.2, 28, 0, -1, '#516d71', 0.08)
    this.hillsideStreet.add(road)
    // A thin raised edge gives the main road a readable, walkable boundary without
    // turning the district into a corridor. These follow the same local ground as
    // the road so they keep the miniature rise-and-fall at street scale.
    this.hillsideStreet.add(this.createRollingStreetSurface(0.16, 28, -2.18, -1, '#f0e8bd', 0.125))
    this.hillsideStreet.add(this.createRollingStreetSurface(0.16, 28, 2.18, -1, '#f0e8bd', 0.125))
    for (const [x, z, width, length] of [[-6, -2, 2.2, 10], [6.2, -4.4, 2.2, 9], [0, -10, 6.5, 2.1]] as Array<[number, number, number, number]>) {
      const path = this.createRollingStreetSurface(width, length, x, z, '#d8d2b2', 0.07)
      this.hillsideStreet.add(path)
    }
    const paint = new MeshLambertMaterial({ color: '#f2e7b9', flatShading: true })
    for (let z = -12; z <= 10; z += 2.2) {
      const dash = new Mesh(new BoxGeometry(0.1, 0.03, 0.75), paint)
      dash.position.set(0, gentleStreetHeight(0, z) + 0.15, z)
      this.hillsideStreet.add(dash)
    }

    this.addFlatBuilding(0, -1.7, '#a4493b', '#303f46', 'STATION')
    this.addStationGate()
    this.addFlatBuilding(6.8, -4.7, '#d8d4c5', '#be7654', 'BAKERY')
    this.addFlatBuilding(-6.8, -7.3, '#e2c971', '#4e6970', 'HOME')
    this.addFlatBuilding(-7.1, 5.3, '#c9ded6', '#50666a', 'DEPOT')
    this.addRavnbroLaneThreshold()
    this.addMarketFold()
    this.addSignalYard()
    this.addFlatKeeper(0, 2.2)
    this.addFlatClue('signal', 'Signal box', -7.2, -0.5, 'The brass plate reads: “Every last train returns in a LOOP.”')
    this.addFlatClue('mural', 'Market mural', 7.2, -1.7, 'A faded market mural shows the town under a gold SUNSET.')
    this.addFlatClue('bell', 'Hill bell', 0, -11.2, 'The hill bell rings once: the old sign needs the last word—LOOP.')
    this.addHillsideTraversalDetail()
    this.addBellRise()
    this.addReedwaterEdge()
    this.addFlatSideRouteLandmarks()
    this.addStreetBlocker(0, -1.7, 2.25)
    this.addStreetBlocker(6.8, -4.7, 1.75)
    this.addStreetBlocker(-6.8, -7.3, 1.75)
    this.addStreetBlocker(-7.1, 5.3, 1.75)
    this.addFlatStreetFurniture()
    this.createStreetLife()
    this.scene.add(this.hillsideStreet)
  }

  /** A first, deliberately compact authored connection from the road to the bell. */
  private addHillsideTraversalDetail(): void {
    const stairRun = new Group()
    const stepMaterial = new MeshLambertMaterial({ color: '#d8d2b2', flatShading: true })
    const riserMaterial = new MeshLambertMaterial({ color: '#b9ae8c', flatShading: true })
    const startZ = -8.95
    const stepDepth = 0.42

    for (let index = 0; index < 6; index += 1) {
      const z = startZ - index * stepDepth
      const rise = index * 0.055
      const step = new Mesh(new BoxGeometry(2.15, 0.13, stepDepth + 0.025), index % 2 === 0 ? stepMaterial : riserMaterial)
      step.position.set(0, gentleStreetHeight(0, z) + rise + 0.065, z)
      stairRun.add(step)
    }

    const railMaterial = new MeshLambertMaterial({ color: '#52666a', flatShading: true })
    for (const x of [-1.18, 1.18]) {
      const rail = new Mesh(new BoxGeometry(0.07, 0.07, 2.64), railMaterial)
      rail.position.set(x, gentleStreetHeight(x, -10.02) + 0.58, -10.02)
      stairRun.add(rail)
      for (const z of [-9.05, -10.02, -10.99]) {
        const post = new Mesh(new CylinderGeometry(0.055, 0.065, 0.72, 5), railMaterial)
        post.position.set(x, gentleStreetHeight(x, z) + 0.36, z)
        stairRun.add(post)
      }
    }

    const retainingMaterial = new MeshLambertMaterial({ color: '#7a8774', flatShading: true })
    for (const x of [-2.65, 2.65]) {
      const wall = new Mesh(new BoxGeometry(0.24, 0.66, 3.1), retainingMaterial)
      wall.position.set(x, gentleStreetHeight(x, -10.15) + 0.33, -10.15)
      stairRun.add(wall)
    }
    this.hillsideStreet.add(stairRun)

    // Small planted edges stop the broad street from reading as an empty plane and
    // also receive local collision so the player cannot clip through them.
    const planterMaterial = new MeshLambertMaterial({ color: '#815b43', flatShading: true })
    const leafMaterial = new MeshLambertMaterial({ color: '#4e9361', flatShading: true })
    for (const [x, z] of [[-3.2, -9.1], [3.2, -9.4]] as Array<[number, number]>) {
      const planter = new Group()
      const box = new Mesh(new BoxGeometry(1.15, 0.42, 0.52), planterMaterial)
      box.position.y = 0.21
      planter.add(box)
      for (const leafX of [-0.3, 0, 0.3]) {
        const leaf = new Mesh(new ConeGeometry(0.16, 0.52, 5), leafMaterial)
        leaf.position.set(leafX, 0.56, 0)
        planter.add(leaf)
      }
      planter.position.set(x, gentleStreetHeight(x, z), z)
      this.hillsideStreet.add(planter)
      this.addStreetBlocker(x, z, 0.68)
    }
  }

  /**
   * Ravnbro ends at a small, protected stretch of reedwater. It gives the
   * opening district a marsh-town horizon while a gap at the bridge remains a
   * readable destination rather than an invisible world boundary.
   */
  private addReedwaterEdge(): void {
    const water = this.createRollingStreetSurface(40, 4.8, 0, -16.45, '#4d9a9a', 0.1)
    this.hillsideStreet.add(water)
    const shore = this.createRollingStreetSurface(40, 0.52, 0, -14.08, '#b9af77', 0.14)
    this.hillsideStreet.add(shore)

    const timber = new MeshLambertMaterial({ color: '#694d3c', flatShading: true })
    const bridgeX = -7
    const bridgeStart = -11.45
    const bridgeLength = 3.95
    const bridgeDeck = this.createRollingStreetSurface(1.75, bridgeLength, bridgeX, bridgeStart - bridgeLength / 2, '#765942', 0.17)
    this.hillsideStreet.add(bridgeDeck)
    for (let index = 0; index < 9; index += 1) {
      const z = bridgeStart - index * 0.43
      const plank = new Mesh(new BoxGeometry(1.85, 0.07, 0.07), timber)
      plank.position.set(bridgeX, gentleStreetHeight(bridgeX, z) + 0.23, z)
      this.hillsideStreet.add(plank)
    }
    for (const xOffset of [-0.78, 0.78]) {
      for (const z of [-11.6, -12.65, -13.68]) {
        const post = new Mesh(new CylinderGeometry(0.055, 0.065, 0.76, 5), timber)
        post.position.set(bridgeX + xOffset, gentleStreetHeight(bridgeX + xOffset, z) + 0.38, z)
        this.hillsideStreet.add(post)
      }
      const rail = new Mesh(new BoxGeometry(0.07, 0.07, 2.3), timber)
      rail.position.set(bridgeX + xOffset, gentleStreetHeight(bridgeX + xOffset, -12.65) + 0.66, -12.65)
      this.hillsideStreet.add(rail)
    }

    const reedStem = new MeshLambertMaterial({ color: '#5d7b4f', flatShading: true })
    const reedTip = new MeshLambertMaterial({ color: '#a98654', flatShading: true })
    for (const [x, z, height] of [
      [-16, -13.78, 0.85], [-13.8, -14.2, 1.08], [-11.8, -13.9, 0.72], [-4.6, -13.86, 1.1],
      [-1.8, -14.18, 0.82], [2.6, -13.85, 1.03], [5.4, -14.14, 0.72], [8.2, -13.86, 1.12],
      [11.3, -14.17, 0.88], [14.7, -13.84, 1.05], [17.2, -14.1, 0.76],
    ] as Array<[number, number, number]>) {
      const stem = new Mesh(new CylinderGeometry(0.026, 0.04, height, 4), reedStem)
      stem.position.set(x, gentleStreetHeight(x, z) + height / 2 + 0.12, z)
      this.hillsideStreet.add(stem)
      const head = new Mesh(new CylinderGeometry(0.045, 0.06, height * 0.28, 4), reedTip)
      head.position.set(x + 0.035, gentleStreetHeight(x, z) + height + 0.15, z)
      head.rotation.z = 0.18
      this.hillsideStreet.add(head)
    }

    for (const [x, z] of [[-8.25, -14.05], [-5.75, -14.05], [4.5, -13.94]] as Array<[number, number]>) {
      const mooringPost = new Mesh(new CylinderGeometry(0.1, 0.13, 0.9, 6), timber)
      mooringPost.position.set(x, gentleStreetHeight(x, z) + 0.45, z)
      this.hillsideStreet.add(mooringPost)
    }
    for (let index = 0; index < 4; index += 1) {
      const ripple = new Mesh(new TorusGeometry(0.18 + index * 0.09, 0.018, 4, 10), new MeshLambertMaterial({ color: '#a8ddd1', transparent: true, opacity: 0.7, flatShading: true }))
      ripple.rotation.x = Math.PI / 2
      const x = 2.2 + index * 3.3
      const z = -16.25 + (index % 2) * 0.55
      ripple.position.set(x, gentleStreetHeight(x, z) + 0.16, z)
      this.hillsideStreet.add(ripple)
    }

    const markerX = 7.3
    const markerZ = -13.55
    const floodPost = new Mesh(new BoxGeometry(0.11, 1.45, 0.11), new MeshLambertMaterial({ color: '#49646a', flatShading: true }))
    floodPost.position.set(markerX, gentleStreetHeight(markerX, markerZ) + 0.72, markerZ)
    this.hillsideStreet.add(floodPost)
    for (let index = 0; index < 3; index += 1) {
      const stripe = new Mesh(new BoxGeometry(0.22, 0.07, 0.03), new MeshLambertMaterial({ color: index === 2 ? '#c7654c' : '#e8dcb3', flatShading: true }))
      stripe.position.set(markerX, gentleStreetHeight(markerX, markerZ) + 0.55 + index * 0.26, markerZ + 0.065)
      this.hillsideStreet.add(stripe)
    }
    const floodSign = this.createSign('REEDWATER', '#eef2dc', 170, 46)
    floodSign.scale.set(0.95, 0.26, 1)
    floodSign.position.set(markerX, gentleStreetHeight(markerX, markerZ) + 1.68, markerZ)
    this.hillsideStreet.add(floodSign)

    // The shore is physical except where the bridge gives a deliberate view and
    // turn-around point. This prevents accidental walks into the water plane.
    for (let x = -18; x <= 18; x += 2.35) {
      if (Math.abs(x - bridgeX) > 1.65) this.addStreetBlocker(x, -14.05, 1.03)
    }
    this.addStreetBlocker(bridgeX, -15.05, 0.78)
  }

  /** A dense, open-ended pocket that makes the mural clue a place to discover. */
  private addMarketFold(): void {
    const marketX = 7.5
    const marketZ = -1.85
    this.hillsideStreet.add(this.createRollingStreetSurface(4.9, 4.2, marketX, marketZ, '#d7c9a7', 0.095))

    const wallX = 9.05
    const wallZ = -3.2
    const wallHeight = 1.58
    const brick = new MeshLambertMaterial({ color: '#a64e3e', flatShading: true })
    const darkBrick = new MeshLambertMaterial({ color: '#783b35', flatShading: true })
    const wall = new Mesh(new BoxGeometry(2.65, wallHeight, 0.16), brick)
    wall.position.set(wallX, gentleStreetHeight(wallX, wallZ) + wallHeight / 2, wallZ)
    this.hillsideStreet.add(wall)
    for (const yOffset of [0.35, 1.05]) {
      const brickBand = new Mesh(new BoxGeometry(2.78, 0.08, 0.19), darkBrick)
      brickBand.position.set(wallX, gentleStreetHeight(wallX, wallZ) + yOffset, wallZ + 0.09)
      this.hillsideStreet.add(brickBand)
    }

    const muralBackdrop = new Mesh(new PlaneGeometry(2.12, 0.96), new MeshLambertMaterial({ color: '#2f7780', side: DoubleSide }))
    muralBackdrop.position.set(wallX, gentleStreetHeight(wallX, wallZ) + 0.94, wallZ + 0.102)
    this.hillsideStreet.add(muralBackdrop)
    const muralSun = new Mesh(new CylinderGeometry(0.23, 0.23, 0.025, 10), new MeshLambertMaterial({ color: '#f3c95d', flatShading: true }))
    muralSun.rotation.x = Math.PI / 2
    muralSun.position.set(wallX + 0.5, gentleStreetHeight(wallX, wallZ) + 1.08, wallZ + 0.12)
    this.hillsideStreet.add(muralSun)
    for (const [offsetX, height, color] of [[-0.54, 0.26, '#d77a4c'], [-0.07, 0.38, '#d77a4c'], [0.75, 0.22, '#4c8d6a']] as Array<[number, number, string]>) {
      const paintedRoof = new Mesh(new ConeGeometry(0.42, height, 3), new MeshLambertMaterial({ color, flatShading: true }))
      paintedRoof.rotation.y = Math.PI / 6
      paintedRoof.position.set(wallX + offsetX, gentleStreetHeight(wallX, wallZ) + 0.58, wallZ + 0.125)
      this.hillsideStreet.add(paintedRoof)
    }
    const muralSign = this.createSign('MARKET FOLD', '#fff0ce', 208, 48)
    muralSign.scale.set(1.15, 0.31, 1)
    muralSign.position.set(wallX, gentleStreetHeight(wallX, wallZ) + 1.92, wallZ + 0.1)
    this.hillsideStreet.add(muralSign)

    const awningMaterial = new MeshLambertMaterial({ color: '#d7984d', flatShading: true })
    const canopy = new Mesh(new BoxGeometry(2.5, 0.16, 0.56), awningMaterial)
    canopy.position.set(6.0, gentleStreetHeight(6.0, -2.72) + 1.28, -2.72)
    this.hillsideStreet.add(canopy)
    const timber = new MeshLambertMaterial({ color: '#6b4d3c', flatShading: true })
    for (const x of [5.0, 7.0]) {
      const post = new Mesh(new BoxGeometry(0.09, 1.28, 0.09), timber)
      post.position.set(x, gentleStreetHeight(x, -2.72) + 0.64, -2.72)
      this.hillsideStreet.add(post)
    }
    const table = new Mesh(new BoxGeometry(1.7, 0.14, 0.58), timber)
    table.position.set(6.0, gentleStreetHeight(6.0, -2.25) + 0.54, -2.25)
    this.hillsideStreet.add(table)
    for (const [x, z] of [[5.45, -2.1], [6.48, -2.35], [5.82, -2.9]] as Array<[number, number]>) {
      const crate = new Mesh(new BoxGeometry(0.42, 0.36, 0.42), new MeshLambertMaterial({ color: '#a67243', flatShading: true }))
      crate.position.set(x, gentleStreetHeight(x, z) + 0.18, z)
      this.hillsideStreet.add(crate)
    }
    const bunting = new Mesh(new BoxGeometry(3.65, 0.035, 0.035), new MeshLambertMaterial({ color: '#5a5152', flatShading: true }))
    bunting.position.set(7.55, gentleStreetHeight(7.55, -1.1) + 1.85, -1.1)
    this.hillsideStreet.add(bunting)
    for (let index = 0; index < 6; index += 1) {
      const flag = new Mesh(new ConeGeometry(0.11, 0.24, 3), new MeshLambertMaterial({ color: index % 2 ? '#e6c55d' : '#d86954', flatShading: true }))
      flag.rotation.x = Math.PI
      const x = 5.9 + index * 0.66
      flag.position.set(x, gentleStreetHeight(x, -1.1) + 1.7, -1.1)
      this.hillsideStreet.add(flag)
    }

    // The mural wall is solid, while the painting and the amber clue remain in
    // the open market approach for reliable interaction on touch and keyboard.
    this.addStreetBlocker(wallX, wallZ, 1.18)
  }

  /** The signal clue sits in an open railway-service pocket, not behind scenery. */
  private addSignalYard(): void {
    const yardX = -8.65
    const yardZ = -0.35
    this.hillsideStreet.add(this.createRollingStreetSurface(4.7, 3.9, yardX, yardZ, '#b9b69d', 0.09))

    const hutX = -10.25
    const hutZ = 0.72
    const hutHeight = 1.28
    const brick = new MeshLambertMaterial({ color: '#9a5141', flatShading: true })
    const darkBrick = new MeshLambertMaterial({ color: '#753c35', flatShading: true })
    const roofMaterial = new MeshLambertMaterial({ color: '#3a5356', flatShading: true })
    const hut = new Mesh(new BoxGeometry(1.72, hutHeight, 1.58), brick)
    hut.position.set(hutX, gentleStreetHeight(hutX, hutZ) + hutHeight / 2, hutZ)
    this.hillsideStreet.add(hut)
    const hutRoof = new Mesh(new ConeGeometry(1.24, 0.68, 4), roofMaterial)
    hutRoof.rotation.y = Math.PI / 4
    hutRoof.position.set(hutX, gentleStreetHeight(hutX, hutZ) + 1.62, hutZ)
    this.hillsideStreet.add(hutRoof)
    const hutDoor = new Mesh(new PlaneGeometry(0.5, 0.82), new MeshLambertMaterial({ color: '#264d53', side: DoubleSide }))
    hutDoor.position.set(hutX, gentleStreetHeight(hutX, hutZ) + 0.42, hutZ + 0.8)
    this.hillsideStreet.add(hutDoor)
    const hutWindow = new Mesh(new PlaneGeometry(0.38, 0.4), new MeshLambertMaterial({ color: '#d9e6d8', side: DoubleSide }))
    hutWindow.position.set(hutX - 0.45, gentleStreetHeight(hutX, hutZ) + 0.88, hutZ + 0.8)
    this.hillsideStreet.add(hutWindow)
    const yardSign = this.createSign('SIGNAL YARD', '#ecf0d8', 185, 46)
    yardSign.scale.set(1.02, 0.28, 1)
    yardSign.position.set(hutX, gentleStreetHeight(hutX, hutZ) + 1.96, hutZ)
    this.hillsideStreet.add(yardSign)

    const iron = new MeshLambertMaterial({ color: '#405b5e', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#6b4d3a', flatShading: true })
    // A shallow fence frames the service bay without cutting off the clue's road approach.
    for (const x of [-10.95, -9.55]) {
      const post = new Mesh(new BoxGeometry(0.09, 0.78, 0.09), timber)
      post.position.set(x, gentleStreetHeight(x, -1.35) + 0.39, -1.35)
      this.hillsideStreet.add(post)
    }
    for (const y of [0.28, 0.56]) {
      const rail = new Mesh(new BoxGeometry(1.52, 0.06, 0.06), timber)
      rail.position.set(-10.25, gentleStreetHeight(-10.25, -1.35) + y, -1.35)
      this.hillsideStreet.add(rail)
    }
    const switchWheel = new Mesh(new TorusGeometry(0.34, 0.055, 5, 10), iron)
    switchWheel.position.set(-8.92, gentleStreetHeight(-8.92, -1.45) + 0.49, -1.45)
    this.hillsideStreet.add(switchWheel)
    const switchStand = new Mesh(new CylinderGeometry(0.05, 0.07, 0.68, 5), iron)
    switchStand.position.set(-8.92, gentleStreetHeight(-8.92, -1.45) + 0.34, -1.45)
    this.hillsideStreet.add(switchStand)
    const toolCrate = new Mesh(new BoxGeometry(0.54, 0.42, 0.48), new MeshLambertMaterial({ color: '#a46d42', flatShading: true }))
    toolCrate.position.set(-9.7, gentleStreetHeight(-9.7, -1.72) + 0.21, -1.72)
    this.hillsideStreet.add(toolCrate)

    const cable = new Mesh(new BoxGeometry(2.35, 0.035, 0.035), iron)
    cable.position.set(-8.8, gentleStreetHeight(-8.8, 1.3) + 1.68, 1.3)
    cable.rotation.z = -0.12
    this.hillsideStreet.add(cable)
    this.addStreetBlocker(hutX, hutZ, 1.06)
  }

  /** A modest civic landmark at the end of the stair route, kept beside the clue. */
  private addBellRise(): void {
    const terrace = this.createRollingStreetSurface(5.4, 2.45, 0, -11.65, '#d5caa6', 0.12)
    this.hillsideStreet.add(terrace)
    const towerX = 2.45
    const towerZ = -11.82
    const towerHeight = 2.22
    const brick = new MeshLambertMaterial({ color: '#995044', flatShading: true })
    const darkBrick = new MeshLambertMaterial({ color: '#713b35', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#344c51', flatShading: true })
    const tower = new Mesh(new BoxGeometry(1.32, towerHeight, 1.22), brick)
    tower.position.set(towerX, gentleStreetHeight(towerX, towerZ) + towerHeight / 2, towerZ)
    this.hillsideStreet.add(tower)
    const towerRoof = new Mesh(new ConeGeometry(1.0, 0.82, 4), slate)
    towerRoof.rotation.y = Math.PI / 4
    towerRoof.position.set(towerX, gentleStreetHeight(towerX, towerZ) + 2.56, towerZ)
    this.hillsideStreet.add(towerRoof)
    const arch = new Mesh(new PlaneGeometry(0.72, 0.64), new MeshLambertMaterial({ color: '#30474d', side: DoubleSide }))
    arch.position.set(towerX, gentleStreetHeight(towerX, towerZ) + 1.62, towerZ + 0.616)
    this.hillsideStreet.add(arch)
    const bell = new Mesh(new ConeGeometry(0.26, 0.37, 7), new MeshLambertMaterial({ color: '#d5a855', emissive: new Color('#926735'), emissiveIntensity: 0.25, flatShading: true }))
    bell.rotation.x = Math.PI
    bell.position.set(towerX, gentleStreetHeight(towerX, towerZ) + 1.63, towerZ + 0.645)
    this.hillsideStreet.add(bell)
    const rope = new Mesh(new CylinderGeometry(0.028, 0.035, 0.78, 5), new MeshLambertMaterial({ color: '#765343', flatShading: true }))
    rope.position.set(towerX, gentleStreetHeight(towerX, towerZ) + 1.1, towerZ + 0.67)
    this.hillsideStreet.add(rope)
    for (const yOffset of [0.48, 1.05]) {
      const band = new Mesh(new BoxGeometry(1.43, 0.09, 1.32), darkBrick)
      band.position.set(towerX, gentleStreetHeight(towerX, towerZ) + yOffset, towerZ)
      this.hillsideStreet.add(band)
    }
    const towerSign = this.createSign('BELL RISE', '#f2ecd1', 170, 45)
    towerSign.scale.set(0.96, 0.26, 1)
    towerSign.position.set(towerX, gentleStreetHeight(towerX, towerZ) + 3.05, towerZ)
    this.hillsideStreet.add(towerSign)

    const railMaterial = new MeshLambertMaterial({ color: '#52666a', flatShading: true })
    for (const x of [-2.35, -1.6]) {
      const post = new Mesh(new CylinderGeometry(0.045, 0.055, 0.68, 5), railMaterial)
      post.position.set(x, gentleStreetHeight(x, -12.05) + 0.34, -12.05)
      this.hillsideStreet.add(post)
    }
    const terraceRail = new Mesh(new BoxGeometry(0.88, 0.06, 0.06), railMaterial)
    terraceRail.position.set(-1.98, gentleStreetHeight(-1.98, -12.05) + 0.61, -12.05)
    this.hillsideStreet.add(terraceRail)
    const benchMaterial = new MeshLambertMaterial({ color: '#7b5a43', flatShading: true })
    const bench = new Mesh(new BoxGeometry(1.18, 0.14, 0.36), benchMaterial)
    bench.position.set(-1.88, gentleStreetHeight(-1.88, -11.42) + 0.42, -11.42)
    this.hillsideStreet.add(bench)
    const benchBack = new Mesh(new BoxGeometry(1.18, 0.32, 0.08), benchMaterial)
    benchBack.position.set(-1.88, gentleStreetHeight(-1.88, -11.42) + 0.62, -11.27)
    this.hillsideStreet.add(benchBack)

    // The marker at x=0 remains clear at the top of the steps; only the tower
    // itself receives collision so the player cannot walk through the landmark.
    this.addStreetBlocker(towerX, towerZ, 0.94)
  }

  /** Arrival props and rail hardware make the station the town's lived-in anchor. */
  private addStationGate(): void {
    const platform = this.createRollingStreetSurface(8.75, 1.08, 0, -3.42, '#c7bd9d', 0.1)
    this.hillsideStreet.add(platform)
    const iron = new MeshLambertMaterial({ color: '#405b5e', flatShading: true })
    const sleeperMaterial = new MeshLambertMaterial({ color: '#704f3d', flatShading: true })
    for (const z of [-4.18, -4.72]) {
      const rail = new Mesh(new BoxGeometry(9.1, 0.07, 0.08), iron)
      rail.position.set(0, gentleStreetHeight(0, z) + 0.18, z)
      this.hillsideStreet.add(rail)
    }
    for (let x = -4; x <= 4; x += 0.72) {
      const sleeper = new Mesh(new BoxGeometry(0.42, 0.08, 1.0), sleeperMaterial)
      sleeper.position.set(x, gentleStreetHeight(x, -4.45) + 0.12, -4.45)
      this.hillsideStreet.add(sleeper)
    }

    const timetableX = 3.18
    const timetableZ = 0.42
    const boardFrame = new Mesh(new BoxGeometry(1.12, 1.28, 0.11), new MeshLambertMaterial({ color: '#34545a', flatShading: true }))
    boardFrame.position.set(timetableX, gentleStreetHeight(timetableX, timetableZ) + 0.83, timetableZ)
    this.hillsideStreet.add(boardFrame)
    const boardFace = new Mesh(new PlaneGeometry(0.88, 0.9), new MeshLambertMaterial({ color: '#f0ead1', side: DoubleSide }))
    boardFace.position.set(timetableX, gentleStreetHeight(timetableX, timetableZ) + 0.86, timetableZ + 0.062)
    this.hillsideStreet.add(boardFace)
    for (let index = 0; index < 4; index += 1) {
      const routeLine = new Mesh(new BoxGeometry(0.58, 0.045, 0.025), new MeshLambertMaterial({ color: index === 1 ? '#c5654e' : '#6d8583', flatShading: true }))
      routeLine.position.set(timetableX, gentleStreetHeight(timetableX, timetableZ) + 1.12 - index * 0.19, timetableZ + 0.077)
      this.hillsideStreet.add(routeLine)
    }
    const timetableSign = this.createSign('LAST LOOP', '#eef1d6', 160, 42)
    timetableSign.scale.set(0.88, 0.24, 1)
    timetableSign.position.set(timetableX, gentleStreetHeight(timetableX, timetableZ) + 1.64, timetableZ)
    this.hillsideStreet.add(timetableSign)

    const cartX = -3.18
    const cartZ = 0.3
    const cartWood = new MeshLambertMaterial({ color: '#855e43', flatShading: true })
    const cartBed = new Mesh(new BoxGeometry(1.18, 0.2, 0.72), cartWood)
    cartBed.position.set(cartX, gentleStreetHeight(cartX, cartZ) + 0.48, cartZ)
    this.hillsideStreet.add(cartBed)
    for (const xOffset of [-0.42, 0.42]) {
      const wheel = new Mesh(new TorusGeometry(0.16, 0.045, 5, 9), iron)
      wheel.rotation.y = Math.PI / 2
      wheel.position.set(cartX + xOffset, gentleStreetHeight(cartX + xOffset, cartZ) + 0.26, cartZ - 0.34)
      this.hillsideStreet.add(wheel)
    }
    const caseOne = new Mesh(new BoxGeometry(0.45, 0.42, 0.42), new MeshLambertMaterial({ color: '#b46e45', flatShading: true }))
    caseOne.position.set(cartX - 0.18, gentleStreetHeight(cartX, cartZ) + 0.79, cartZ)
    this.hillsideStreet.add(caseOne)
    const caseTwo = new Mesh(new BoxGeometry(0.38, 0.28, 0.36), new MeshLambertMaterial({ color: '#d0a257', flatShading: true }))
    caseTwo.position.set(cartX + 0.28, gentleStreetHeight(cartX, cartZ) + 0.72, cartZ + 0.06)
    this.hillsideStreet.add(caseTwo)

    const benchMaterial = new MeshLambertMaterial({ color: '#765440', flatShading: true })
    for (const [x, z] of [[-4.55, -0.2], [4.55, -0.45]] as Array<[number, number]>) {
      const seat = new Mesh(new BoxGeometry(1.22, 0.14, 0.36), benchMaterial)
      seat.position.set(x, gentleStreetHeight(x, z) + 0.42, z)
      this.hillsideStreet.add(seat)
      const back = new Mesh(new BoxGeometry(1.22, 0.3, 0.08), benchMaterial)
      back.position.set(x, gentleStreetHeight(x, z) + 0.62, z + 0.14)
      this.hillsideStreet.add(back)
    }
    for (const x of [-4.1, 4.1]) {
      const bollard = new Mesh(new CylinderGeometry(0.09, 0.12, 0.74, 6), new MeshLambertMaterial({ color: '#4a6265', flatShading: true }))
      bollard.position.set(x, gentleStreetHeight(x, 0.9) + 0.37, 0.9)
      this.hillsideStreet.add(bollard)
    }
    this.addStreetBlocker(timetableX, timetableZ, 0.64)
    this.addStreetBlocker(cartX, cartZ, 0.72)
  }

  private createRollingStreetSurface(width: number, length: number, x: number, z: number, color: string, offset: number): Mesh {
    const geometry = new PlaneGeometry(width, length, Math.max(2, Math.ceil(width)), Math.max(4, Math.ceil(length / 1.5)))
    const positions = geometry.getAttribute('position')
    for (let index = 0; index < positions.count; index += 1) {
      positions.setZ(index, gentleStreetHeight(x + positions.getX(index), z - positions.getY(index)) + offset)
    }
    geometry.computeVertexNormals()
    geometry.rotateX(-Math.PI / 2)
    const surface = new Mesh(geometry, new MeshLambertMaterial({ color, flatShading: true, side: DoubleSide }))
    surface.position.set(x, 0, z)
    return surface
  }

  private addFlatBuilding(x: number, z: number, wall: string, roofColor: string, label: string): void {
    if (label === 'STATION') {
      this.addRavnbroStation(x, z, wall, roofColor)
      return
    }
    this.addRavnbroFrontage(x, z, wall, roofColor, label)
  }

  /** Replaces isolated house primitives with small, imperfect street façades. */
  private addRavnbroFrontage(x: number, z: number, wall: string, roofColor: string, label: string): void {
    const building = new Group()
    const width = label === 'DEPOT' ? 3.35 : label === 'BAKERY' ? 3.05 : 2.72
    const bodyHeight = label === 'DEPOT' ? 1.82 : 1.68
    const depth = 2.05
    const wallMaterial = new MeshLambertMaterial({ color: wall, flatShading: true })
    const frameMaterial = new MeshLambertMaterial({ color: label === 'DEPOT' ? '#6b4840' : '#574239', flatShading: true })
    const roofMaterial = new MeshLambertMaterial({ color: roofColor, flatShading: true })
    const body = new Mesh(new BoxGeometry(width, bodyHeight, depth), wallMaterial)
    body.position.y = bodyHeight / 2
    building.add(body)
    const roof = new Mesh(new ConeGeometry(width * 0.68, 0.82, 4), roofMaterial)
    roof.rotation.y = Math.PI / 4
    roof.position.y = bodyHeight + 0.42
    building.add(roof)

    // Timber grid: deliberately slightly uneven spans make a compact row feel
    // hand-built rather than a repeated suburban house asset.
    const frontZ = depth / 2 + 0.014
    const frameXs = label === 'DEPOT' ? [-1.38, -0.47, 0.47, 1.38] : [-width / 2 + 0.22, 0, width / 2 - 0.22]
    for (const frameX of frameXs) {
      const upright = new Mesh(new BoxGeometry(0.11, bodyHeight + 0.13, 0.07), frameMaterial)
      upright.position.set(frameX, bodyHeight / 2, frontZ)
      building.add(upright)
    }
    for (const frameY of [0.42, bodyHeight - 0.34]) {
      const beam = new Mesh(new BoxGeometry(width + 0.08, 0.1, 0.08), frameMaterial)
      beam.position.set(0, frameY, frontZ)
      building.add(beam)
    }
    const windowXs = label === 'DEPOT' ? [-1.0, 1.0] : [-width * 0.27, width * 0.27]
    for (const windowX of windowXs) {
      const window = new Mesh(new PlaneGeometry(0.43, 0.5), new MeshLambertMaterial({ color: '#dce8df', side: DoubleSide }))
      window.position.set(windowX, bodyHeight * 0.62, frontZ + 0.006)
      building.add(window)
    }
    const doorWidth = label === 'DEPOT' ? 0.86 : 0.58
    const door = new Mesh(new PlaneGeometry(doorWidth, 0.92), new MeshLambertMaterial({ color: label === 'BAKERY' ? '#47666c' : '#31555b', side: DoubleSide }))
    door.position.set(0, 0.47, frontZ + 0.008)
    building.add(door)
    if (label === 'BAKERY') {
      const awningMaterial = new MeshLambertMaterial({ color: '#d5a34d', flatShading: true })
      const awning = new Mesh(new BoxGeometry(width - 0.3, 0.16, 0.48), awningMaterial)
      awning.position.set(0, 1.12, 1.27)
      building.add(awning)
      const shopSign = this.createSign('BAKEHOUSE', '#fff5d8', 190, 52)
      shopSign.scale.set(1.1, 0.3, 1)
      shopSign.position.set(0, 1.53, 1.08)
      building.add(shopSign)
    }
    if (label === 'DEPOT') {
      const depotSign = this.createSign('YARD', '#eaf2dc', 150, 48)
      depotSign.scale.set(0.86, 0.27, 1)
      depotSign.position.set(0, 1.54, 1.08)
      building.add(depotSign)
    }
    if (label === 'HOME') {
      const passage = new Mesh(new BoxGeometry(0.76, 0.82, 0.12), frameMaterial)
      passage.position.set(0, 0.41, frontZ + 0.025)
      building.add(passage)
      const passageInset = new Mesh(new PlaneGeometry(0.5, 0.62), new MeshLambertMaterial({ color: '#263f45', side: DoubleSide }))
      passageInset.position.set(0, 0.36, frontZ + 0.09)
      building.add(passageInset)
    }
    building.position.set(x, gentleStreetHeight(x, z), z)
    this.hillsideStreet.add(building)
  }

  /** A small service-lane threshold makes the depot route read as part of a town. */
  private addRavnbroLaneThreshold(): void {
    const lane = this.createRollingStreetSurface(1.28, 3.25, -5.1, 4.1, '#cfc6a2', 0.075)
    this.hillsideStreet.add(lane)
    const gate = new Group()
    const timber = new MeshLambertMaterial({ color: '#62463a', flatShading: true })
    for (const x of [-0.52, 0.52]) {
      const post = new Mesh(new BoxGeometry(0.13, 1.42, 0.13), timber)
      post.position.set(x, 0.71, 0)
      gate.add(post)
    }
    const lintel = new Mesh(new BoxGeometry(1.22, 0.16, 0.16), timber)
    lintel.position.set(0, 1.34, 0)
    gate.add(lintel)
    const lantern = new Mesh(new SphereGeometry(0.1, 6, 5), new MeshLambertMaterial({ color: '#f4d779', emissive: new Color('#c78639'), emissiveIntensity: 0.7, flatShading: true }))
    lantern.position.set(0, 1.13, 0.1)
    gate.add(lantern)
    gate.position.set(-5.1, gentleStreetHeight(-5.1, 2.55), 2.55)
    this.hillsideStreet.add(gate)
  }

  /**
   * Ravnbro's station uses an original civic red-brick kit: a long, low wing,
   * tall centre gable, repeated pale windows and a compact cobbled forecourt.
   * The proportions are intentionally stylised rather than a model of any real
   * station building.
   */
  private addRavnbroStation(x: number, z: number, brick: string, roofColor: string): void {
    const station = new Group()
    const brickMaterial = new MeshLambertMaterial({ color: brick, flatShading: true })
    const darkBrickMaterial = new MeshLambertMaterial({ color: '#7f362f', flatShading: true })
    const roofMaterial = new MeshLambertMaterial({ color: roofColor, flatShading: true })
    const windowMaterial = new MeshLambertMaterial({ color: '#dbe6df', side: DoubleSide })
    const doorMaterial = new MeshLambertMaterial({ color: '#254955', side: DoubleSide })

    const wing = new Mesh(new BoxGeometry(6.8, 1.48, 1.92), brickMaterial)
    wing.position.y = 0.74
    station.add(wing)
    const centralHall = new Mesh(new BoxGeometry(2.5, 2.18, 2.12), brickMaterial)
    centralHall.position.y = 1.09
    station.add(centralHall)
    const wingRoof = new Mesh(new ConeGeometry(3.85, 0.72, 4), roofMaterial)
    wingRoof.rotation.y = Math.PI / 4
    wingRoof.position.y = 1.82
    station.add(wingRoof)
    const gableRoof = new Mesh(new ConeGeometry(1.75, 0.94, 4), roofMaterial)
    gableRoof.rotation.y = Math.PI / 4
    gableRoof.position.y = 2.25
    station.add(gableRoof)

    for (const windowX of [-2.8, -1.88, -0.76, 0.76, 1.88, 2.8]) {
      const window = new Mesh(new PlaneGeometry(0.45, 0.54), windowMaterial)
      window.position.set(windowX, 0.86, 0.971)
      station.add(window)
    }
    for (const windowX of [-0.62, 0.62]) {
      const upperWindow = new Mesh(new PlaneGeometry(0.38, 0.52), windowMaterial)
      upperWindow.position.set(windowX, 1.68, 1.081)
      station.add(upperWindow)
    }
    const clockRim = new Mesh(new CylinderGeometry(0.26, 0.26, 0.06, 12), new MeshLambertMaterial({ color: '#f3eed7', flatShading: true }))
    clockRim.rotation.x = Math.PI / 2
    clockRim.position.set(0, 2.15, 1.105)
    station.add(clockRim)
    for (const doorX of [-0.43, 0.43]) {
      const door = new Mesh(new PlaneGeometry(0.52, 0.94), doorMaterial)
      door.position.set(doorX, 0.5, 1.085)
      station.add(door)
    }
    for (const chimneyX of [-2.55, -1.1, 1.1, 2.55]) {
      const chimney = new Mesh(new BoxGeometry(0.2, 0.7, 0.22), darkBrickMaterial)
      chimney.position.set(chimneyX, 2.45, 0)
      station.add(chimney)
    }
    const canopy = new Mesh(new BoxGeometry(2.25, 0.11, 0.62), new MeshLambertMaterial({ color: '#d8d2b2', flatShading: true }))
    canopy.position.set(0, 1.05, 1.3)
    station.add(canopy)
    const sign = this.createSign(this.save.quest.stationNameRestored ? 'SUNSET LOOP' : '____ ____', this.save.quest.stationNameRestored ? '#f8d34e' : '#efeee2')
    sign.position.set(0, 2.72, 1.22)
    station.add(sign)
    this.streetStationSign = sign

    const forecourt = new Mesh(new CylinderGeometry(2.5, 2.78, 0.08, 12), new MeshLambertMaterial({ color: '#b99d78', flatShading: true }))
    forecourt.position.set(0, gentleStreetHeight(x, z + 1.8) - gentleStreetHeight(x, z) + 0.04, 1.8)
    station.add(forecourt)
    station.position.set(x, gentleStreetHeight(x, z), z)
    this.hillsideStreet.add(station)
    this.streetStationDoorPosition.set(x, gentleStreetHeight(x, z + 1.22), z + 1.22)
  }

  private addFlatKeeper(x: number, z: number): void {
    const keeper = new Group()
    const coat = new Mesh(new CylinderGeometry(0.3, 0.37, 0.92, 6), new MeshLambertMaterial({ color: '#d25f4b', flatShading: true }))
    coat.position.y = 0.56
    keeper.add(coat)
    const head = new Mesh(new SphereGeometry(0.26, 8, 6), new MeshLambertMaterial({ color: '#dca48a', flatShading: true }))
    head.position.y = 1.2
    keeper.add(head)
    const hat = new Mesh(new CylinderGeometry(0.34, 0.34, 0.11, 8), new MeshLambertMaterial({ color: '#314955', flatShading: true }))
    hat.position.y = 1.44
    keeper.add(hat)
    keeper.position.set(x, gentleStreetHeight(x, z), z)
    this.hillsideStreet.add(keeper)
  }

  private addFlatClue(id: ClueId, label: string, x: number, z: number, text: string): void {
    const marker = new Group()
    const base = new Mesh(new CylinderGeometry(0.28, 0.33, 0.42, 5), new MeshLambertMaterial({ color: '#de9348', flatShading: true }))
    base.position.y = 0.21
    marker.add(base)
    const beacon = new Mesh(new CylinderGeometry(0.05, 0.07, 0.95, 5), new MeshLambertMaterial({ color: '#c9793d', flatShading: true }))
    beacon.position.y = 0.72
    marker.add(beacon)
    const glow = new Mesh(new SphereGeometry(0.27, 8, 6), new MeshLambertMaterial({ color: '#f8dc69', emissive: new Color('#f3b34c'), emissiveIntensity: 1, flatShading: true }))
    glow.position.y = 1.28
    marker.add(glow)
    const labelSprite = this.createSign(label, '#fff5d8', 256, 72)
    labelSprite.scale.set(1.55, 0.43, 1)
    labelSprite.position.y = 1.84
    marker.add(labelSprite)
    const height = gentleStreetHeight(x, z)
    marker.position.set(x, height, z)
    this.hillsideStreet.add(marker)
    this.streetClues.push({ id, label, text, mesh: marker, position: [x, height, z] })
  }

  private addFlatSideRouteLandmarks(): void {
    this.addFlatSignalLandmark(-8.7, -0.5)
    this.addFlatBellLandmark(0, -12.3)
    this.addFlatSideMarker('lens-cache', 'Depot lens', 'lantern', -9.2, 4.7, 'A warm brass lens waits in the depot crate. Take it back to the signal.', 'first')
    this.addFlatSideMarker('signal-repair', 'Fit lens', 'lantern', -7.2, -0.5, 'The signal wakes green. One more corner of the loop feels safe after dusk.', 'second')
    this.addFlatSideMarker('tune-card', 'Tune card', 'chorus', 5.5, -8.2, 'A small tune card reads: “Three notes for the hill bell.”', 'first')
    this.addFlatSideMarker('bell-chime', 'Ring bell', 'chorus', 0, -11.2, 'The hill bell answers the tune. Birds lift from the rooftops in reply.', 'second')
    this.streetChorusFireflies.visible = this.save.quest.chorus === 'complete'
    this.hillsideStreet.add(this.streetChorusFireflies)
    this.updateSideQuestMarkers()
  }

  private addFlatSignalLandmark(x: number, z: number): void {
    const signal = new Group()
    const pole = new Mesh(new CylinderGeometry(0.09, 0.12, 1.75, 6), new MeshLambertMaterial({ color: '#354a4d', flatShading: true }))
    pole.position.y = 0.88
    signal.add(pole)
    this.streetSignalBulb = new MeshLambertMaterial({ color: this.save.quest.lantern === 'complete' ? '#78c271' : '#ca6854', emissive: new Color(this.save.quest.lantern === 'complete' ? '#4f9e5a' : '#803f39'), emissiveIntensity: 0.7, flatShading: true })
    const bulb = new Mesh(new SphereGeometry(0.2, 8, 6), this.streetSignalBulb)
    bulb.position.y = 1.72
    signal.add(bulb)
    signal.position.set(x, gentleStreetHeight(x, z), z)
    this.hillsideStreet.add(signal)
  }

  private addFlatBellLandmark(x: number, z: number): void {
    const bell = new Group()
    const frame = new Mesh(new BoxGeometry(0.78, 1.18, 0.18), new MeshLambertMaterial({ color: '#6d5948', flatShading: true }))
    frame.position.y = 0.59
    bell.add(frame)
    this.streetBellGlow = new MeshLambertMaterial({ color: '#d9a94f', emissive: new Color(this.save.quest.chorus === 'complete' ? '#d8894d' : '#715640'), emissiveIntensity: this.save.quest.chorus === 'complete' ? 0.6 : 0.1, flatShading: true })
    const bellBody = new Mesh(new ConeGeometry(0.34, 0.44, 7), this.streetBellGlow)
    bellBody.rotation.x = Math.PI
    bellBody.position.y = 0.8
    bell.add(bellBody)
    bell.position.set(x, gentleStreetHeight(x, z), z)
    this.hillsideStreet.add(bell)
    for (let index = 0; index < 10; index += 1) {
      const firefly = new Mesh(new SphereGeometry(0.055, 6, 5), new MeshLambertMaterial({ color: '#f8db68', emissive: new Color('#efb648'), emissiveIntensity: 0.9 }))
      firefly.position.set(Math.cos(index * 0.63) * (0.8 + index % 3 * 0.16), 1.5 + index % 3 * 0.27, Math.sin(index * 0.63) * (0.8 + index % 3 * 0.16))
      this.streetChorusFireflies.add(firefly)
    }
    this.streetChorusFireflies.position.set(x, gentleStreetHeight(x, z), z)
  }

  private addFlatSideMarker(id: SideMarkerId, label: string, sideQuest: SideQuestId, x: number, z: number, text: string, requiredStage: 'first' | 'second'): void {
    const marker = new Group()
    const color = sideQuest === 'lantern' ? '#71bcb9' : '#d683a2'
    const base = new Mesh(new CylinderGeometry(0.23, 0.28, 0.32, 5), new MeshLambertMaterial({ color, flatShading: true }))
    base.position.y = 0.16
    marker.add(base)
    const glow = new Mesh(new SphereGeometry(0.17, 8, 6), new MeshLambertMaterial({ color: '#fff0a7', emissive: new Color(color), emissiveIntensity: 0.9, flatShading: true }))
    glow.position.y = 0.55
    marker.add(glow)
    const labelSprite = this.createSign(label, '#fff5d8', 228, 64)
    labelSprite.scale.set(1.35, 0.37, 1)
    labelSprite.position.y = 1.02
    marker.add(labelSprite)
    const height = gentleStreetHeight(x, z)
    marker.position.set(x, height, z)
    this.hillsideStreet.add(marker)
    this.streetSideMarkers.push({ id, label, sideQuest, requiredStage, district: 'hillside', text, mesh: marker, position: [x, height, z] })
  }

  private addStreetBlocker(x: number, z: number, radius: number): void {
    this.streetBlockers.push({ center: new Vector3(x, 0, z), radius })
  }

  private addFlatStreetFurniture(): void {
    const poleMaterial = new MeshLambertMaterial({ color: '#36535a', flatShading: true })
    for (const [x, z] of [[-2.5, 3.5], [2.5, -6.8], [-4.8, -4.6], [4.9, -1.2]]) {
      const lamp = new Group()
      const pole = new Mesh(new CylinderGeometry(0.055, 0.08, 1.8, 6), poleMaterial)
      pole.position.y = 0.9
      lamp.add(pole)
      const bulb = new Mesh(new SphereGeometry(0.12, 7, 5), new MeshLambertMaterial({ color: '#ffe38c', emissive: new Color('#d89b48'), emissiveIntensity: 0.72, flatShading: true }))
      bulb.position.y = 1.72
      lamp.add(bulb)
      lamp.position.set(x, gentleStreetHeight(x, z), z)
      this.hillsideStreet.add(lamp)
    }
    for (const [x, z] of [[-2.5, -2.2], [3.2, -8.7]]) {
      const bench = new Group()
      const wood = new MeshLambertMaterial({ color: '#805a43', flatShading: true })
      const seat = new Mesh(new BoxGeometry(1.15, 0.14, 0.36), wood)
      seat.position.y = 0.42
      bench.add(seat)
      const back = new Mesh(new BoxGeometry(1.15, 0.34, 0.1), wood)
      back.position.set(0, 0.63, 0.13)
      bench.add(back)
      bench.position.set(x, gentleStreetHeight(x, z), z)
      this.hillsideStreet.add(bench)
    }
    for (const [x, z] of [[-3.6, 0.8], [3.8, -3.3], [-4.2, -8.5], [4.2, -8.8]]) {
      const tree = new Group()
      const trunk = new Mesh(new CylinderGeometry(0.1, 0.15, 1.05, 5), new MeshLambertMaterial({ color: '#6b5041', flatShading: true }))
      trunk.position.y = 0.52
      tree.add(trunk)
      const crown = new Mesh(new ConeGeometry(0.95, 1.8, 6), new MeshLambertMaterial({ color: '#3e815e', flatShading: true }))
      crown.position.y = 1.7
      tree.add(crown)
      tree.position.set(x, gentleStreetHeight(x, z), z)
      this.hillsideStreet.add(tree)
    }
  }

  /** Decorative local activity only: it has no simulation, collision or network state. */
  private createStreetLife(): void {
    const addWalker = (coatColor: string, hatColor: string, from: [number, number], to: [number, number], phase: number): void => {
      const walker = new Group()
      const coat = new Mesh(new CylinderGeometry(0.22, 0.29, 0.7, 5), new MeshLambertMaterial({ color: coatColor, flatShading: true }))
      coat.position.y = 0.52
      walker.add(coat)
      const head = new Mesh(new SphereGeometry(0.2, 7, 6), new MeshLambertMaterial({ color: '#d6a179', flatShading: true }))
      head.position.y = 1.02
      walker.add(head)
      const hat = new Mesh(new CylinderGeometry(0.22, 0.25, 0.08, 6), new MeshLambertMaterial({ color: hatColor, flatShading: true }))
      hat.position.y = 1.2
      walker.add(hat)
      walker.userData = { kind: 'walker', from, to, phase }
      this.streetLife.add(walker)
    }

    addWalker('#547f8a', '#344d57', [5.2, 0.45], [7.5, -3.85], 0.08)
    addWalker('#b66d4c', '#4e514c', [-5.2, 2.2], [-8.1, -1.25], 0.53)

    for (let index = 0; index < 4; index += 1) {
      const bird = new Mesh(new ConeGeometry(0.08, 0.34, 3), new MeshLambertMaterial({ color: '#294b50', flatShading: true }))
      bird.rotation.x = Math.PI / 2
      bird.userData = { kind: 'bird', phase: index * 1.47 }
      this.streetLife.add(bird)
    }
    for (let index = 0; index < 5; index += 1) {
      const butterfly = new Mesh(new PlaneGeometry(0.13, 0.09), new MeshLambertMaterial({ color: index % 2 === 0 ? '#ef8a67' : '#f5ce55', side: DoubleSide, flatShading: true }))
      butterfly.userData = { kind: 'butterfly', phase: index * 1.21 }
      this.streetLife.add(butterfly)
    }
    this.hillsideStreet.add(this.streetLife)
  }

  private createHarbourWorld(): void {
    this.harbourWorld.visible = false
    const ocean = new Mesh(
      new SphereGeometry(PLANET_RADIUS - 0.2, 40, 28),
      new MeshStandardMaterial({ color: '#276f7a', roughness: 0.9, metalness: 0 }),
    )
    this.harbourWorld.add(ocean)
    this.harbourGround = new Mesh(
      new SphereGeometry(PLANET_RADIUS, 40, 28, 0, Math.PI * 2, 0, 1.7),
      new MeshLambertMaterial({ color: '#718d79', flatShading: true }),
    )
    this.harbourWorld.add(this.harbourGround)
    const rim = new Mesh(
      new TorusGeometry(8.35, 0.14, 6, 72),
      new MeshLambertMaterial({ color: '#30494d', flatShading: true }),
    )
    rim.rotation.x = Math.PI / 2
    rim.position.y = -0.7
    this.harbourWorld.add(rim)
    this.addHarbourRail()
    this.addHarbourDistrict()
    this.scene.add(this.harbourWorld)
    this.createHarbourAmbient()
  }

  private createObservatoryWorld(): void {
    this.observatoryWorld.visible = false
    const ocean = new Mesh(new SphereGeometry(PLANET_RADIUS - 0.2, 40, 28), new MeshStandardMaterial({ color: '#263d72', roughness: 0.92, metalness: 0 }))
    this.observatoryWorld.add(ocean)
    this.observatoryGround = new Mesh(new SphereGeometry(PLANET_RADIUS, 40, 28, 0, Math.PI * 2, 0, 1.7), new MeshLambertMaterial({ color: '#627a8b', flatShading: true }))
    this.observatoryWorld.add(this.observatoryGround)
    const rim = new Mesh(new TorusGeometry(8.35, 0.14, 6, 72), new MeshLambertMaterial({ color: '#3a466d', flatShading: true }))
    rim.rotation.x = Math.PI / 2
    rim.position.y = -0.7
    this.observatoryWorld.add(rim)
    const dome = new Group()
    const base = new Mesh(new CylinderGeometry(1.7, 1.9, 1.35, 8), new MeshLambertMaterial({ color: '#e5dfca', flatShading: true }))
    base.position.y = 0.67
    dome.add(base)
    const roof = new Mesh(new SphereGeometry(1.72, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), new MeshLambertMaterial({ color: '#48517d', flatShading: true }))
    roof.position.y = 1.35
    dome.add(roof)
    const sign = this.createSign('MOONHILL', '#f0dc83', 320, 72)
    sign.scale.set(2.5, 0.54, 1)
    sign.position.set(0, 2.65, 1.1)
    dome.add(sign)
    this.placeOnPlanet(dome, 0.45, -0.02, 0.1)
    this.observatoryWorld.add(dome)
    this.addBlocker('observatory', 0.45, -0.02, 0.23)
    const telescope = new Group()
    const pedestal = new Mesh(new CylinderGeometry(0.26, 0.42, 1.15, 6), new MeshLambertMaterial({ color: '#7e6a9f', flatShading: true }))
    pedestal.position.y = 0.56
    telescope.add(pedestal)
    const tube = new Mesh(new CylinderGeometry(0.18, 0.27, 2.35, 8), new MeshLambertMaterial({ color: '#d4c6e8', flatShading: true }))
    tube.rotation.z = Math.PI / 2.9
    tube.position.set(0.72, 1.45, 0)
    telescope.add(tube)
    this.observatoryBeacon = new MeshLambertMaterial({ color: this.save.quest.observatory === 'complete' ? '#9ce0ce' : '#8975bc', emissive: new Color(this.save.quest.observatory === 'complete' ? '#4a9f8c' : '#4d3d83'), emissiveIntensity: 0.8 })
    const lens = new Mesh(new SphereGeometry(0.22, 8, 6), this.observatoryBeacon)
    lens.position.set(1.35, 1.9, 0)
    telescope.add(lens)
    this.placeOnPlanet(telescope, 0.31, 0.42, -0.3)
    this.observatoryWorld.add(telescope)
    for (let index = 0; index < 12; index += 1) {
      const star = new Mesh(new SphereGeometry(0.05, 5, 4), new MeshLambertMaterial({ color: '#f6e9a8', emissive: new Color('#d8b756'), emissiveIntensity: 0.8 }))
      star.position.set(Math.cos(index * 1.8) * (6 + index % 3), 5.5 + index % 4, Math.sin(index * 1.8) * (6 + index % 3))
      this.observatoryWorld.add(star)
    }
    this.addSideMarker('observatory-lens', 'Starlight lens', 'observatory', 0.53, -0.5, 'A small starlight lens glows in the grass. The telescope can see again.', 'first', 'observatory')
    this.addSideMarker('observatory-scope', 'Align scope', 'observatory', 0.31, 0.42, 'The moon signal crosses the glass. Every faraway station gets one clear night.', 'second', 'observatory')
    this.updateSideQuestMarkers()
    this.scene.add(this.observatoryWorld)
  }

  private addHarbourRail(): void {
    const rail = new Mesh(
      new TorusGeometry(7.8, 0.075, 5, 96),
      new MeshLambertMaterial({ color: '#213d43', flatShading: true }),
    )
    rail.rotation.x = Math.PI / 2
    rail.position.y = 0.45
    this.harbourWorld.add(rail)
    for (let index = 0; index < 18; index += 1) {
      const angle = -0.8 + index / 17 * 1.6
      const sleeper = new Mesh(new BoxGeometry(0.42, 0.05, 0.12), new MeshLambertMaterial({ color: '#a86f47', flatShading: true }))
      sleeper.position.set(Math.cos(angle) * 7.8, 0.45, Math.sin(angle) * 7.8)
      sleeper.rotation.y = -angle
      this.harbourWorld.add(sleeper)
    }
  }

  private addHarbourDistrict(): void {
    this.addHarbourWarehouse()
    this.addCrane()
    this.addDock()
    this.addBoat()
    this.addHarbourKeeper()
    this.addHarbourMarker('harbour-valve', 'Tide valve', 'first', 0.48, -0.55, 'A blue tide valve clicks free. The dock pump can hear the sea again.')
    this.addHarbourMarker('harbour-pump', 'Wake clock', 'second', 0.33, 0.18, 'The tide clock turns once, then keeps time with the water. The harbour breathes again.')
    this.updateSideQuestMarkers()
  }

  private addHarbourWarehouse(): void {
    const warehouse = new Group()
    const body = new Mesh(new BoxGeometry(3.1, 1.65, 1.9), new MeshLambertMaterial({ color: '#b96d52', flatShading: true }))
    body.position.y = 0.82
    warehouse.add(body)
    const roof = new Mesh(new BoxGeometry(3.35, 0.28, 2.15), new MeshLambertMaterial({ color: '#2e4c52', flatShading: true }))
    roof.position.y = 1.75
    warehouse.add(roof)
    const door = new Mesh(new PlaneGeometry(0.92, 1.05), new MeshLambertMaterial({ color: '#26464d', side: DoubleSide }))
    door.position.set(-0.62, 0.55, 0.96)
    warehouse.add(door)
    const sign = this.createSign('HARBOUR WORKS', '#f6d368', 360, 76)
    sign.scale.set(2.9, 0.58, 1)
    sign.position.set(0, 2.3, 1.08)
    warehouse.add(sign)
    this.placeOnPlanet(warehouse, 0.43, -0.08, 0.1)
    this.harbourWorld.add(warehouse)
    this.addBlocker('harbour', 0.43, -0.08, 0.21)
  }

  private addCrane(): void {
    const crane = new Group()
    const orange = new MeshLambertMaterial({ color: '#dc8550', flatShading: true })
    const mast = new Mesh(new BoxGeometry(0.24, 3.7, 0.24), orange)
    mast.position.y = 1.85
    crane.add(mast)
    const arm = new Mesh(new BoxGeometry(3.2, 0.18, 0.18), orange)
    arm.position.set(1.45, 3.45, 0)
    crane.add(arm)
    const cable = new Mesh(new CylinderGeometry(0.025, 0.025, 1.2, 5), new MeshLambertMaterial({ color: '#28444a', flatShading: true }))
    cable.position.set(2.75, 2.85, 0)
    crane.add(cable)
    const hook = new Mesh(new TorusGeometry(0.14, 0.035, 5, 9), new MeshLambertMaterial({ color: '#f1c65b', flatShading: true }))
    hook.position.set(2.75, 2.2, 0)
    crane.add(hook)
    this.placeOnPlanet(crane, 0.57, 0.48, -0.45)
    this.harbourWorld.add(crane)
  }

  private addDock(): void {
    const dock = new Group()
    const planks = new MeshLambertMaterial({ color: '#805a43', flatShading: true })
    for (let index = 0; index < 7; index += 1) {
      const plank = new Mesh(new BoxGeometry(0.68, 0.12, 2.8), planks)
      plank.position.set((index - 3) * 0.68, 0.16, 0)
      dock.add(plank)
    }
    for (const x of [-2.1, 2.1]) {
      const post = new Mesh(new CylinderGeometry(0.1, 0.14, 1.1, 5), planks)
      post.position.set(x, 0.55, -0.85)
      dock.add(post)
    }
    const clockFrame = new Mesh(new BoxGeometry(0.85, 1.05, 0.18), new MeshLambertMaterial({ color: '#35535a', flatShading: true }))
    clockFrame.position.set(-1.42, 0.77, 0.5)
    dock.add(clockFrame)
    this.harbourBeacon = new MeshLambertMaterial({ color: this.save.quest.harbour === 'complete' ? '#74c888' : '#4f94b1', emissive: new Color(this.save.quest.harbour === 'complete' ? '#4c9b67' : '#235f7d'), emissiveIntensity: 0.7 })
    const clockFace = new Mesh(new SphereGeometry(0.22, 8, 6), this.harbourBeacon)
    clockFace.position.set(-1.42, 0.82, 0.64)
    dock.add(clockFace)
    this.placeOnPlanet(dock, 0.31, -0.5, 0.8)
    this.harbourWorld.add(dock)
  }

  private addBoat(): void {
    const boat = new Group()
    const hull = new Mesh(new BoxGeometry(1.35, 0.48, 2.15), new MeshLambertMaterial({ color: '#e7dfc7', flatShading: true }))
    hull.position.y = 0.24
    boat.add(hull)
    const cabin = new Mesh(new BoxGeometry(0.86, 0.55, 0.75), new MeshLambertMaterial({ color: '#e0b452', flatShading: true }))
    cabin.position.set(0, 0.66, -0.22)
    boat.add(cabin)
    const mast = new Mesh(new CylinderGeometry(0.04, 0.05, 1.45, 5), new MeshLambertMaterial({ color: '#324b51', flatShading: true }))
    mast.position.set(0, 1.05, 0.35)
    boat.add(mast)
    this.placeOnPlanet(boat, 0.22, -0.78, -0.6)
    this.harbourWorld.add(boat)
  }

  private addHarbourKeeper(): void {
    const keeper = new Group()
    const coat = new Mesh(new CylinderGeometry(0.27, 0.34, 0.85, 6), new MeshLambertMaterial({ color: '#315d7a', flatShading: true }))
    coat.position.y = 0.55
    keeper.add(coat)
    const head = new Mesh(new SphereGeometry(0.24, 8, 6), new MeshLambertMaterial({ color: '#dca48a', flatShading: true }))
    head.position.y = 1.15
    keeper.add(head)
    const cap = new Mesh(new CylinderGeometry(0.31, 0.31, 0.1, 8), new MeshLambertMaterial({ color: '#e1b859', flatShading: true }))
    cap.position.y = 1.38
    keeper.add(cap)
    this.placeOnPlanet(keeper, 0.5, -0.12, -0.35)
    this.harbourWorld.add(keeper)
  }

  private addHarbourMarker(id: 'harbour-valve' | 'harbour-pump', label: string, requiredStage: 'first' | 'second', latitude: number, longitude: number, text: string): void {
    this.addSideMarker(id, label, 'harbour', latitude, longitude, text, requiredStage, 'harbour')
  }

  private addRailLoop(): void {
    const ring = new Mesh(
      new TorusGeometry(7.8, 0.075, 5, 96),
      new MeshLambertMaterial({ color: '#283c40', flatShading: true }),
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.45
    this.root.add(ring)
    for (let index = 0; index < 26; index += 1) {
      const angle = (index / 26) * Math.PI * 2
      const sleeper = new Mesh(new BoxGeometry(0.42, 0.05, 0.12), new MeshLambertMaterial({ color: '#d1a466' }))
      sleeper.position.set(Math.cos(angle) * 7.8, 0.45, Math.sin(angle) * 7.8)
      sleeper.rotation.y = -angle
      this.root.add(sleeper)
    }
  }

  private addDistrict(): void {
    this.addStreetZone()
    this.addBuilding(0.38, -0.42, 0.1, '#e7dbbc', '#36565b', 'STATION')
    this.addBuilding(0.52, 0.12, -0.22, '#d8d4c5', '#be7654', 'BAKERY')
    this.addBuilding(0.31, 0.6, 0.45, '#e2c971', '#4e6970', 'HOME')
    this.addBuilding(0.62, -0.86, -0.1, '#c9ded6', '#50666a', 'DEPOT')
    this.stationDoorPosition.copy(this.normalAt(0.38, -0.42)).multiplyScalar(PLANET_RADIUS)
    this.addSteps(0.47, 0.42)
    this.addTrees()
    this.addStationKeeper()
    this.addClue('signal', 'Signal box', 0.78, -0.2, 'The brass plate reads: “Every last train returns in a LOOP.”')
    this.addClue('mural', 'Market mural', 0.7, 0.38, 'A faded market mural shows the town under a gold SUNSET.')
    this.addClue('bell', 'Hill bell', 0.04, 0.52, 'The hill bell rings once: the old sign needs the last word—LOOP.')
    this.addSideQuestLandmarks()
    this.setStationSign(this.save.quest.stationNameRestored ? 'SUNSET LOOP' : '____ ____', this.save.quest.stationNameRestored ? '#f8d34e' : '#efeee2')
  }

  private addStreetZone(): void {
    this.addStreetSegment(0.4, -0.24, 0.62, 5.8, 2.15, '#587277', true)
    this.addStreetSegment(0.49, 0.16, -0.28, 3.75, 1.45, '#d9d5b9', false)
    this.addStreetSegment(0.32, 0.54, 0.28, 3.25, 1.05, '#c7b88b', false)
    this.addRetainingWall(0.45, -0.03, 0.45, 2.7)
    this.addShopFront(0.52, 0.12, -0.22)
    this.addBench(0.43, 0.03, 0.15)
    this.addBench(0.31, 0.47, -0.35)
    this.addLamp(0.44, -0.35, 0.18)
    this.addLamp(0.48, 0.24, -0.4)
    this.addPlanter(0.51, -0.08, 0.2)
    this.addPlanter(0.35, 0.38, -0.22)
  }

  private addStreetSegment(latitude: number, longitude: number, heading: number, length: number, width: number, color: string, centreLine: boolean): void {
    const street = new Group()
    const surface = new Mesh(new BoxGeometry(width, 0.12, length), new MeshLambertMaterial({ color, flatShading: true }))
    surface.position.y = 0.07
    street.add(surface)
    const kerbMaterial = new MeshLambertMaterial({ color: '#ece6c8', flatShading: true })
    for (const side of [-1, 1]) {
      const kerb = new Mesh(new BoxGeometry(0.15, 0.16, length + 0.12), kerbMaterial)
      kerb.position.set(side * (width / 2 + 0.08), 0.1, 0)
      street.add(kerb)
    }
    if (centreLine) {
      const paint = new MeshLambertMaterial({ color: '#efe6bd', flatShading: true })
      for (let index = -2; index <= 2; index += 1) {
        const dash = new Mesh(new BoxGeometry(0.08, 0.025, 0.48), paint)
        dash.position.set(0, 0.145, index * 1.05)
        street.add(dash)
      }
    }
    this.placeOnPlanet(street, latitude, longitude, heading)
    this.root.add(street)
  }

  private addRetainingWall(latitude: number, longitude: number, heading: number, length: number): void {
    const wall = new Group()
    const base = new Mesh(new BoxGeometry(length, 0.7, 0.22), new MeshLambertMaterial({ color: '#81918a', flatShading: true }))
    base.position.y = 0.35
    wall.add(base)
    for (let index = 0; index < 4; index += 1) {
      const cap = new Mesh(new BoxGeometry(0.52, 0.08, 0.31), new MeshLambertMaterial({ color: '#d4d4b9', flatShading: true }))
      cap.position.set(-1.02 + index * 0.68, 0.73, 0)
      wall.add(cap)
    }
    this.placeOnPlanet(wall, latitude, longitude, heading)
    this.root.add(wall)
  }

  private addShopFront(latitude: number, longitude: number, heading: number): void {
    const shop = new Group()
    const front = new Mesh(new BoxGeometry(1.7, 0.82, 0.16), new MeshLambertMaterial({ color: '#e7d7a5', flatShading: true }))
    front.position.set(0, 0.48, 0.94)
    shop.add(front)
    const window = new Mesh(new PlaneGeometry(0.68, 0.48), new MeshLambertMaterial({ color: '#3f767b', side: DoubleSide }))
    window.position.set(-0.38, 0.57, 1.03)
    shop.add(window)
    const door = new Mesh(new PlaneGeometry(0.34, 0.66), new MeshLambertMaterial({ color: '#bd7650', side: DoubleSide }))
    door.position.set(0.45, 0.42, 1.03)
    shop.add(door)
    const awning = new Mesh(new BoxGeometry(1.9, 0.14, 0.62), new MeshLambertMaterial({ color: '#d58b52', flatShading: true }))
    awning.position.set(0, 1.13, 1.12)
    shop.add(awning)
    this.placeOnPlanet(shop, latitude, longitude, heading)
    this.root.add(shop)
  }

  private addBench(latitude: number, longitude: number, heading: number): void {
    const bench = new Group()
    const wood = new MeshLambertMaterial({ color: '#805a43', flatShading: true })
    const seat = new Mesh(new BoxGeometry(0.95, 0.12, 0.32), wood)
    seat.position.y = 0.38
    bench.add(seat)
    const back = new Mesh(new BoxGeometry(0.95, 0.32, 0.09), wood)
    back.position.set(0, 0.58, 0.12)
    bench.add(back)
    for (const x of [-0.33, 0.33]) {
      const leg = new Mesh(new BoxGeometry(0.1, 0.36, 0.12), new MeshLambertMaterial({ color: '#3a5556', flatShading: true }))
      leg.position.set(x, 0.18, 0)
      bench.add(leg)
    }
    this.placeOnPlanet(bench, latitude, longitude, heading)
    this.root.add(bench)
  }

  private addLamp(latitude: number, longitude: number, heading: number): void {
    const lamp = new Group()
    const pole = new Mesh(new CylinderGeometry(0.055, 0.08, 1.75, 6), new MeshLambertMaterial({ color: '#36535a', flatShading: true }))
    pole.position.y = 0.88
    lamp.add(pole)
    const shade = new Mesh(new ConeGeometry(0.2, 0.18, 6), new MeshLambertMaterial({ color: '#28434a', flatShading: true }))
    shade.position.y = 1.74
    lamp.add(shade)
    const bulb = new Mesh(new SphereGeometry(0.11, 7, 5), new MeshLambertMaterial({ color: '#ffe38c', emissive: new Color('#d89b48'), emissiveIntensity: 0.72, flatShading: true }))
    bulb.position.y = 1.63
    lamp.add(bulb)
    this.placeOnPlanet(lamp, latitude, longitude, heading)
    this.root.add(lamp)
  }

  private addPlanter(latitude: number, longitude: number, heading: number): void {
    const planter = new Group()
    const box = new Mesh(new BoxGeometry(0.58, 0.3, 0.52), new MeshLambertMaterial({ color: '#a76d4b', flatShading: true }))
    box.position.y = 0.16
    planter.add(box)
    for (const x of [-0.14, 0.12]) {
      const leaf = new Mesh(new ConeGeometry(0.18, 0.55, 5), new MeshLambertMaterial({ color: '#3e815e', flatShading: true }))
      leaf.position.set(x, 0.52, 0)
      planter.add(leaf)
    }
    this.placeOnPlanet(planter, latitude, longitude, heading)
    this.root.add(planter)
  }

  private addBuilding(latitude: number, longitude: number, heading: number, wall: string, roofColor: string, label: string): void {
    const building = new Group()
    const body = new Mesh(new BoxGeometry(2.2, 1.55, 1.7), new MeshLambertMaterial({ color: wall, flatShading: true }))
    body.position.y = 0.78
    building.add(body)
    const roof = new Mesh(new ConeGeometry(1.55, 0.72, 4), new MeshLambertMaterial({ color: roofColor, flatShading: true }))
    roof.rotation.y = Math.PI / 4
    roof.position.y = 1.9
    building.add(roof)
    for (const x of [-0.6, 0.6]) {
      const window = new Mesh(new PlaneGeometry(0.42, 0.42), new MeshLambertMaterial({ color: '#274a54', side: DoubleSide }))
      window.position.set(x, 0.97, 0.856)
      building.add(window)
    }
    this.placeOnPlanet(building, latitude, longitude, heading)
    this.root.add(building)
    this.addBlocker('hillside', latitude, longitude, 0.19)
    if (label === 'STATION') {
      const door = new Mesh(new PlaneGeometry(0.5, 0.83), new MeshLambertMaterial({ color: '#3b7680', side: DoubleSide }))
      door.position.set(0, 0.47, 0.86)
      building.add(door)
      const sign = this.createSign('____ ____', '#efeee2')
      sign.position.set(0, 2.42, 0.94)
      building.add(sign)
      this.stationSign = sign
    }
  }

  private addSteps(latitude: number, longitude: number): void {
    const steps = new Group()
    for (let index = 0; index < 6; index += 1) {
      const step = new Mesh(new BoxGeometry(0.9, 0.11, 0.35), new MeshLambertMaterial({ color: '#d8d6b4' }))
      step.position.set(0, index * 0.1, -index * 0.3)
      steps.add(step)
    }
    this.placeOnPlanet(steps, latitude, longitude, 0.8)
    this.root.add(steps)
  }

  private addTrees(): void {
    const trees: Array<[number, number, number]> = [[0.19, -0.9, 0.1], [0.25, -0.72, 0.4], [0.65, 0.64, 0.3], [0.62, 0.78, -0.3], [0.38, 0.91, 0.1], [0.31, 0.99, -0.2]]
    for (const [latitude, longitude, scale] of trees) {
      const tree = new Group()
      const trunk = new Mesh(new CylinderGeometry(0.09, 0.13, 0.8, 5), new MeshLambertMaterial({ color: '#6b5041', flatShading: true }))
      trunk.position.y = 0.4
      tree.add(trunk)
      const crown = new Mesh(new ConeGeometry(0.68 + scale, 1.35, 6), new MeshLambertMaterial({ color: '#3e815e', flatShading: true }))
      crown.position.y = 1.25
      tree.add(crown)
      this.placeOnPlanet(tree, latitude, longitude, longitude * 0.2)
      this.root.add(tree)
    }
  }

  private addStationKeeper(): void {
    const keeper = new Group()
    const coat = new Mesh(new CylinderGeometry(0.27, 0.34, 0.85, 6), new MeshLambertMaterial({ color: '#d25f4b', flatShading: true }))
    coat.position.y = 0.55
    keeper.add(coat)
    const head = new Mesh(new SphereGeometry(0.24, 8, 6), new MeshLambertMaterial({ color: '#dca48a', flatShading: true }))
    head.position.y = 1.15
    keeper.add(head)
    const hat = new Mesh(new CylinderGeometry(0.32, 0.32, 0.11, 8), new MeshLambertMaterial({ color: '#314955', flatShading: true }))
    hat.position.y = 1.37
    keeper.add(hat)
    this.placeOnPlanet(keeper, 0.47, -0.14, 0.3)
    this.root.add(keeper)
    keeper.userData.interactable = 'station-keeper'
  }

  private addClue(id: ClueId, label: string, latitude: number, longitude: number, text: string): void {
    const marker = new Group()
    const base = new Mesh(new CylinderGeometry(0.24, 0.28, 0.4, 5), new MeshLambertMaterial({ color: '#de9348', flatShading: true }))
    base.position.y = 0.2
    marker.add(base)
    const beacon = new Mesh(new CylinderGeometry(0.045, 0.065, 0.76, 5), new MeshLambertMaterial({ color: '#c9793d', flatShading: true }))
    beacon.position.y = 0.62
    marker.add(beacon)
    const glow = new Mesh(new SphereGeometry(0.22, 8, 6), new MeshLambertMaterial({ color: '#f8dc69', emissive: new Color('#f3b34c'), emissiveIntensity: 1, flatShading: true }))
    glow.position.y = 1.08
    marker.add(glow)
    const labelSprite = this.createSign(label, '#fff5d8', 256, 72)
    labelSprite.scale.set(1.45, 0.4, 1)
    labelSprite.position.y = 1.58
    marker.add(labelSprite)
    this.placeOnPlanet(marker, latitude, longitude, 0)
    this.root.add(marker)
    const position = marker.getWorldPosition(new Vector3())
    this.clues.push({ id, label, text, mesh: marker, position: [position.x, position.y, position.z] })
  }

  private addSideQuestLandmarks(): void {
    this.addSignalTower()
    this.addBellLandmark()
    this.addSideMarker('lens-cache', 'Depot lens', 'lantern', 0.8, -0.35, 'A warm brass lens waits in the depot crate. Take it back to the signal.', 'first')
    this.addSideMarker('signal-repair', 'Fit lens', 'lantern', 0.78, -0.2, 'The signal wakes green. One more corner of the loop feels safe after dusk.', 'second')
    this.addSideMarker('tune-card', 'Tune card', 'chorus', 0.1, -0.1, 'A small tune card reads: “Three notes for the hill bell.”', 'first')
    this.addSideMarker('bell-chime', 'Ring bell', 'chorus', 0.04, 0.52, 'The hill bell answers the tune. Birds lift from the rooftops in reply.', 'second')
    for (let index = 0; index < 16; index += 1) {
      const firefly = new Mesh(new SphereGeometry(0.05, 6, 5), new MeshLambertMaterial({ color: '#f8db68', emissive: new Color('#efb648'), emissiveIntensity: 0.8 }))
      firefly.userData.phase = index / 16 * Math.PI * 2
      this.chorusFireflies.add(firefly)
    }
    this.chorusFireflies.visible = this.save.quest.chorus === 'complete'
    this.root.add(this.chorusFireflies)
    this.updateSideQuestMarkers()
  }

  private addSignalTower(): void {
    const tower = new Group()
    const pole = new Mesh(new CylinderGeometry(0.08, 0.1, 1.25, 5), new MeshLambertMaterial({ color: '#354a4d', flatShading: true }))
    pole.position.y = 0.62
    tower.add(pole)
    this.signalBulb = new MeshLambertMaterial({ color: this.save.quest.lantern === 'complete' ? '#78c271' : '#ca6854', emissive: new Color(this.save.quest.lantern === 'complete' ? '#4f9e5a' : '#803f39'), emissiveIntensity: 0.55 })
    const bulb = new Mesh(new SphereGeometry(0.16, 8, 6), this.signalBulb)
    bulb.position.y = 1.25
    tower.add(bulb)
    this.placeOnPlanet(tower, 0.78, -0.26, 0)
    this.root.add(tower)
  }

  private addBellLandmark(): void {
    const bell = new Group()
    const frame = new Mesh(new BoxGeometry(0.6, 1, 0.14), new MeshLambertMaterial({ color: '#6d5948', flatShading: true }))
    frame.position.y = 0.5
    bell.add(frame)
    const bellBody = new Mesh(new ConeGeometry(0.29, 0.38, 7), new MeshLambertMaterial({ color: '#d9a94f', flatShading: true }))
    bellBody.rotation.x = Math.PI
    bellBody.position.y = 0.68
    bell.add(bellBody)
    this.placeOnPlanet(bell, 0.04, 0.59, 0.4)
    this.root.add(bell)
  }

  private addSideMarker(id: SideMarkerId, label: string, sideQuest: SideQuestId, latitude: number, longitude: number, text: string, requiredStage: 'first' | 'second', district: DistrictId = 'hillside'): void {
    const marker = new Group()
    const colour = sideQuest === 'lantern' ? '#71bcb9' : sideQuest === 'chorus' ? '#d683a2' : '#4b9ec2'
    const base = new Mesh(new CylinderGeometry(0.2, 0.25, 0.28, 5), new MeshLambertMaterial({ color: colour, flatShading: true }))
    base.position.y = 0.14
    marker.add(base)
    const glow = new Mesh(new SphereGeometry(0.13, 8, 6), new MeshLambertMaterial({ color: '#fff0a7', emissive: new Color(colour), emissiveIntensity: 0.85 }))
    glow.position.y = 0.48
    marker.add(glow)
    const labelSprite = this.createSign(label, '#fff5d8', 228, 64)
    labelSprite.scale.set(1.25, 0.34, 1)
    labelSprite.position.y = 0.88
    marker.add(labelSprite)
    this.placeOnPlanet(marker, latitude, longitude, 0)
    ;(district === 'harbour' ? this.harbourWorld : this.root).add(marker)
    const position = marker.getWorldPosition(new Vector3())
    this.sideMarkers.push({ id, label, sideQuest, requiredStage, district, text, mesh: marker, position: [position.x, position.y, position.z] })
  }

  private createPlayer(): void {
    this.playerCoat = new MeshLambertMaterial({ color: coatColors[this.save.coatColor], flatShading: true })
    const torso = new Mesh(new CylinderGeometry(0.3, 0.38, 0.85, 6), this.playerCoat)
    torso.position.y = 0.55
    this.player.add(torso)
    const bag = new Mesh(new BoxGeometry(0.3, 0.43, 0.14), new MeshLambertMaterial({ color: '#784c36', flatShading: true }))
    bag.position.set(0.26, 0.65, 0.13)
    this.player.add(bag)
    const head = new Mesh(new SphereGeometry(0.25, 8, 6), new MeshLambertMaterial({ color: '#edaf8f', flatShading: true }))
    head.position.y = 1.18
    this.player.add(head)
    this.root.add(this.player)
  }

  private createStationInterior(): void {
    this.stationInterior.visible = false
    const floor = new Mesh(new PlaneGeometry(14, 10), new MeshLambertMaterial({ color: '#bd9d75' }))
    floor.rotation.x = -Math.PI / 2
    this.stationInterior.add(floor)
    const backWall = new Mesh(new BoxGeometry(12, 5.2, 0.35), new MeshLambertMaterial({ color: '#d8d1bd', flatShading: true }))
    backWall.position.set(0, 2.6, -3.4)
    this.stationInterior.add(backWall)
    const sideWall = new Mesh(new BoxGeometry(0.35, 5.2, 8), new MeshLambertMaterial({ color: '#c5bb9f', flatShading: true }))
    sideWall.position.set(-5.8, 2.6, 0)
    this.stationInterior.add(sideWall)
    const counter = new Mesh(new BoxGeometry(5.7, 1.3, 1), new MeshLambertMaterial({ color: '#7f5a49', flatShading: true }))
    counter.position.set(-1.5, 0.65, -1.35)
    this.stationInterior.add(counter)
    const map = this.createSign('SUNSET LOOP  •  ROUTE MAP', '#f8d34e', 620, 125)
    map.position.set(0.7, 3.15, -3.16)
    map.scale.set(5.5, 1.1, 1)
    this.stationInterior.add(map)
    const harbour = this.createSign('HARBOUR WORKS  —  LATER', '#dbe9dd', 350, 70)
    harbour.position.set(-1.25, 1.86, -3.14)
    harbour.scale.set(3.15, 0.62, 1)
    this.stationInterior.add(harbour)
    const observatory = this.createSign('MOONHILL OBSERVATORY  —  LATER', '#dbe9dd', 420, 70)
    observatory.position.set(1.2, 1.17, -3.14)
    observatory.scale.set(3.8, 0.62, 1)
    this.stationInterior.add(observatory)
    const lamp = new Mesh(new SphereGeometry(0.32, 8, 6), new MeshLambertMaterial({ color: '#ffe477', emissive: new Color('#e7a943'), emissiveIntensity: 0.9 }))
    lamp.position.set(3.9, 3.7, -2.6)
    this.stationInterior.add(lamp)
    this.scene.add(this.stationInterior)
  }

  private createAmbientLife(): void {
    for (let index = 0; index < 8; index += 1) {
      const bird = new Mesh(new ConeGeometry(0.11, 0.45, 3), new MeshLambertMaterial({ color: '#2d4d59', flatShading: true }))
      bird.rotation.x = Math.PI / 2
      bird.userData.phase = index / 8 * Math.PI * 2
      this.ambient.add(bird)
    }
    for (let index = 0; index < 10; index += 1) {
      const butterfly = new Mesh(new PlaneGeometry(0.13, 0.1), new MeshLambertMaterial({ color: index % 2 ? '#f5d44e' : '#ef7661', side: DoubleSide }))
      butterfly.userData.phase = index / 10 * Math.PI * 2
      this.ambient.add(butterfly)
    }
    const cloudMaterial = new MeshLambertMaterial({ color: '#d6f1d9', transparent: true, opacity: 0.78, flatShading: true })
    for (let index = 0; index < 5; index += 1) {
      const cloud = new Mesh(new SphereGeometry(0.7, 7, 5), cloudMaterial)
      cloud.scale.set(1.8, 0.42, 0.75)
      cloud.userData.phase = index / 5 * Math.PI * 2
      this.ambient.add(cloud)
    }
    this.scene.add(this.ambient)
  }

  private createHarbourAmbient(): void {
    for (let index = 0; index < 5; index += 1) {
      const gull = new Mesh(new ConeGeometry(0.12, 0.5, 3), new MeshLambertMaterial({ color: '#f4edd5', flatShading: true }))
      gull.rotation.x = Math.PI / 2
      gull.userData.phase = index / 5 * Math.PI * 2
      this.harbourAmbient.add(gull)
    }
    for (let index = 0; index < 7; index += 1) {
      const wave = new Mesh(new TorusGeometry(0.18 + index * 0.025, 0.025, 4, 10), new MeshLambertMaterial({ color: '#8bd3c6', transparent: true, opacity: 0.75, flatShading: true }))
      wave.rotation.x = Math.PI / 2
      wave.userData.phase = index / 7 * Math.PI * 2
      this.harbourAmbient.add(wave)
    }
    this.harbourAmbient.visible = false
    this.scene.add(this.harbourAmbient)
  }

  private showHarbour(resetPosition: boolean): void {
    this.stationInterior.visible = false
    this.inStation = false
    this.root.visible = false
    this.hillsideStreet.visible = false
    this.ambient.visible = false
    this.root.remove(this.player)
    this.hillsideStreet.remove(this.player)
    this.harbourWorld.add(this.player)
    this.harbourWorld.visible = true
    this.harbourAmbient.visible = true
    this.player.visible = true
    this.save.district = 'harbour'
    if (resetPosition) this.currentNormal.copy(this.normalAt(0.34, -0.3))
    this.updateSideQuestMarkers()
    this.soundscape.setProfile(soundscapeProfile(this.save.quest))
  }

  private showObservatory(resetPosition: boolean): void {
    this.stationInterior.visible = false
    this.inStation = false
    this.root.visible = false
    this.hillsideStreet.visible = false
    this.ambient.visible = false
    this.harbourWorld.visible = false
    this.harbourAmbient.visible = false
    this.root.remove(this.player)
    this.hillsideStreet.remove(this.player)
    this.harbourWorld.remove(this.player)
    this.observatoryWorld.add(this.player)
    this.observatoryWorld.visible = true
    this.player.visible = true
    this.save.district = 'observatory'
    if (resetPosition) this.currentNormal.copy(this.normalAt(0.34, -0.3))
    this.updateSideQuestMarkers()
    this.soundscape.setProfile(soundscapeProfile(this.save.quest))
  }

  private placeOnPlanet(object: Object3D, latitude: number, longitude: number, heading: number): void {
    const normal = this.normalAt(latitude, longitude)
    object.position.copy(normal.multiplyScalar(PLANET_RADIUS))
    object.quaternion.setFromUnitVectors(UP, normal)
    object.rotateY(heading)
  }

  private normalAt(latitude: number, longitude: number): Vector3 {
    return new Vector3(Math.sin(latitude) * Math.cos(longitude), Math.cos(latitude), Math.sin(latitude) * Math.sin(longitude))
  }

  private addBlocker(district: DistrictId, latitude: number, longitude: number, radius: number): void {
    this.blockersByDistrict[district].push({ normal: this.normalAt(latitude, longitude), radius })
  }

  private createSign(text: string, color: string, width = 350, height = 96): Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')!
    context.fillStyle = '#29484f'
    context.fillRect(6, 8, width - 12, height - 16)
    context.fillStyle = color
    context.fillRect(12, 14, width - 24, height - 28)
    context.fillStyle = '#263f46'
    context.font = `900 ${Math.floor(height * 0.42)}px ui-rounded, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, width / 2, height / 2 + 2)
    const material = new SpriteMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false })
    const sprite = new Sprite(material)
    sprite.scale.set(2.2, 0.6, 1)
    return sprite
  }

  private setStationSign(text: string, color: string): void {
    const replacement = this.createSign(text, color)
    for (const sign of [this.stationSign, this.streetStationSign]) {
      if (!sign) continue
      sign.material.map?.dispose()
      sign.material.dispose()
      sign.material = replacement.material.clone()
    }
    replacement.material.dispose()
  }

  private tick = (): void => {
    this.animationFrame = 0
    if (!shouldRender(document.visibilityState)) return
    const now = performance.now()
    const delta = Math.min((now - this.clock.last) / 1000, 0.05)
    this.clock.last = now
    this.clock.elapsed += delta
    if (this.started) {
      if (this.inStation) this.updateStation()
      else this.updatePlayer(delta)
    }
    else this.updateTitleCamera()
    this.updateAmbient()
    this.updateStreetLife()
    this.soundscape.update(this.clock.elapsed)
    this.renderer.render(this.scene, this.camera)
    this.animationFrame = requestAnimationFrame(this.tick)
  }

  private updatePlayer(delta: number): void {
    if (this.hillsideStreet.visible) {
      this.updateHillsideStreetPlayer(delta)
      return
    }
    this.entryCameraProgress = Math.min(1, this.entryCameraProgress + delta / 1.05)
    const keyboard = new Vector2(
      (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0),
      (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) - (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0),
    )
    const input = this.joystick.lengthSq() > 0.002 ? this.joystick.clone() : keyboard
    if (input.lengthSq() > 0) {
      input.normalize()
      const cameraForward = tangentForward(this.camera.getWorldDirection(new Vector3()), this.currentNormal)
      const cameraRight = new Vector3().crossVectors(cameraForward, this.currentNormal).normalize()
      const direction = cameraForward.multiplyScalar(input.y).add(cameraRight.multiplyScalar(input.x)).normalize()
      const candidateNormal = this.currentNormal.clone().addScaledVector(direction, delta * 0.36).normalize()
      if (isWithinWalkableCap(candidateNormal, WALKABLE_ANCHOR, WALKABLE_ANGLE) && isOutsideSphericalBlockers(candidateNormal, this.blockersByDistrict[this.save.district])) {
        this.raycaster.set(candidateNormal.clone().multiplyScalar(PLANET_RADIUS + 2), candidateNormal.clone().negate())
        const activeGround = this.save.district === 'harbour' ? this.harbourGround ?? this.ground : this.save.district === 'observatory' ? this.observatoryGround ?? this.ground : this.ground
        const hit = this.raycaster.intersectObject(activeGround, false)[0]
        if (hit) this.currentNormal.copy(hit.point).normalize()
        this.playerForward.lerp(direction, 0.16).normalize()
        this.persist(false)
      }
    }
    const playerPosition = this.currentNormal.clone().multiplyScalar(PLANET_RADIUS + 0.04)
    this.player.position.copy(playerPosition)
    this.player.quaternion.setFromUnitVectors(UP, this.currentNormal)
    const facing = tangentForward(this.playerForward, this.currentNormal)
    this.player.lookAt(playerPosition.clone().add(facing))
    this.player.rotateY(Math.PI)

    const profile = entryCameraProfile(this.entryCameraProgress)
    const cameraPosition = playerPosition.clone().addScaledVector(this.currentNormal, profile.height).addScaledVector(facing, -profile.followDistance)
    this.camera.position.lerp(cameraPosition, 0.13)
    this.camera.up.copy(this.currentNormal)
    this.camera.lookAt(playerPosition.clone().addScaledVector(facing, profile.lookAhead).addScaledVector(this.currentNormal, 0.42))
    this.findNearby(playerPosition)
  }

  private enterHillsideStreet(): void {
    this.root.visible = false
    this.ambient.visible = false
    this.hillsideStreet.visible = true
    this.root.remove(this.player)
    this.hillsideStreet.add(this.player)
    this.player.visible = true
    this.streetPosition.set(0, 0, 7.4)
    this.streetForward.set(0, 0, -1)
  }

  private updateHillsideStreetPlayer(delta: number): void {
    const keyboard = new Vector2(
      (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0),
      (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) - (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0),
    )
    const input = this.joystick.lengthSq() > 0.002 ? this.joystick.clone() : keyboard
    if (input.lengthSq() > 0) {
      input.normalize()
      const direction = new Vector3(input.x, 0, -input.y).normalize()
      const candidate = this.streetPosition.clone().addScaledVector(direction, delta * 4.2)
      const inBounds = Math.abs(candidate.x) < 18.5 && candidate.z < 14.5 && candidate.z > -15.5
      const clearOfBuildings = this.streetBlockers.every((blocker) => candidate.distanceTo(blocker.center) > blocker.radius)
      if (inBounds && clearOfBuildings) {
        this.streetPosition.copy(candidate)
        this.streetForward.copy(direction)
      }
    }
    const playerPosition = this.streetPosition.clone().setY(gentleStreetHeight(this.streetPosition.x, this.streetPosition.z) + 0.04)
    this.player.position.copy(playerPosition)
    this.player.quaternion.identity()
    this.player.rotation.y = Math.atan2(this.streetForward.x, this.streetForward.z)

    const cameraPosition = playerPosition.clone().add(new Vector3(0, 4.2, 6.8))
    this.camera.position.lerp(cameraPosition, 0.16)
    this.camera.up.copy(UP)
    this.camera.lookAt(playerPosition.clone().add(new Vector3(0, 0.95, -3.2)))
    this.findNearby(playerPosition)
  }

  private updateTitleCamera(): void {
    const angle = animationTime(this.clock.elapsed, window.matchMedia('(prefers-reduced-motion: reduce)').matches) * 0.14
    this.camera.position.set(Math.cos(angle) * 20, 13 + Math.sin(angle * 1.7) * 2, Math.sin(angle) * 20)
    this.camera.up.copy(UP)
    this.camera.lookAt(0, 1.3, 0)
  }

  private updateStation(): void {
    this.camera.position.set(0, 3.6, 7.3)
    this.camera.up.copy(UP)
    this.camera.lookAt(0, 1.8, -2.6)
    const lamp = this.stationInterior.children.at(-1)
    if (lamp) lamp.position.y = 3.7 + Math.sin(this.clock.elapsed * 2) * 0.07
  }

  private updateAmbient(): void {
    const motion = animationTime(this.clock.elapsed, window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    this.ambient.children.forEach((object, index) => {
      const phase = Number(object.userData.phase ?? 0)
      if (index < 8) {
        object.position.set(Math.cos(motion * 0.8 + phase) * 11, 7 + Math.sin(motion * 1.3 + phase) * 1.4, Math.sin(motion * 0.8 + phase) * 11)
        object.rotation.z = Math.sin(motion * 3 + phase) * 0.35
      } else if (index < 18) {
        object.position.set(Math.cos(motion * 1.2 + phase) * 5.5, 8 + Math.sin(motion * 2.7 + phase) * 0.32, Math.sin(motion * 1.2 + phase) * 5.5)
        object.rotation.y = motion * 3 + phase
      } else {
        object.position.set(Math.cos(motion * 0.12 + phase) * 18, 9 + index % 2, Math.sin(motion * 0.12 + phase) * 18)
      }
    })
    this.chorusFireflies.children.forEach((object) => {
      const phase = Number(object.userData.phase ?? 0)
      object.position.set(Math.cos(motion * 1.6 + phase) * 1.2, 4.4 + Math.sin(motion * 2.2 + phase) * 0.55, Math.sin(motion * 1.6 + phase) * 1.2)
    })
    this.harbourAmbient.children.forEach((object, index) => {
      const phase = Number(object.userData.phase ?? 0)
      if (index < 5) {
        object.position.set(Math.cos(motion * 0.9 + phase) * 10.5, 6.1 + Math.sin(motion * 1.5 + phase) * 0.65, Math.sin(motion * 0.9 + phase) * 10.5)
        object.rotation.z = Math.sin(motion * 3 + phase) * 0.28
      } else {
        const radius = 4.5 + index * 0.22
        object.position.set(Math.cos(motion * 0.38 + phase) * radius, 0.8, Math.sin(motion * 0.38 + phase) * radius)
      }
    })
  }

  private updateStreetLife(): void {
    if (!this.hillsideStreet.visible) return
    const motion = animationTime(this.clock.elapsed, window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    this.streetLife.children.forEach((object) => {
      const kind = String(object.userData.kind ?? '')
      const phase = Number(object.userData.phase ?? 0)
      if (kind === 'walker') {
        const from = object.userData.from as [number, number]
        const to = object.userData.to as [number, number]
        const travel = (Math.sin(motion * 0.38 + phase * Math.PI * 2) + 1) / 2
        const x = from[0] + (to[0] - from[0]) * travel
        const z = from[1] + (to[1] - from[1]) * travel
        object.position.set(x, gentleStreetHeight(x, z) + Math.sin(motion * 4 + phase) * 0.018, z)
        const direction = travel > 0.5 ? 1 : -1
        object.rotation.y = Math.atan2((to[0] - from[0]) * direction, (to[1] - from[1]) * direction)
      } else if (kind === 'bird') {
        const angle = motion * 0.48 + phase
        object.position.set(Math.cos(angle) * 5.5 - 0.8, 4.9 + Math.sin(angle * 2.2) * 0.22, Math.sin(angle) * 4.1 - 1.7)
        object.rotation.y = -angle + Math.PI / 2
        object.rotation.z = Math.sin(motion * 5 + phase) * 0.14
      } else if (kind === 'butterfly') {
        const angle = motion * 1.45 + phase
        const x = 4.5 + Math.cos(angle) * 1.45
        const z = -7.8 + Math.sin(angle * 1.3) * 0.78
        object.position.set(x, gentleStreetHeight(x, z) + 0.85 + Math.sin(angle * 2.5) * 0.16, z)
        object.rotation.y = -angle + Math.PI / 2
      }
    })
  }

  private findNearby(position: Vector3): void {
    let next: Clue | SideMarker | 'station-keeper' | 'station-door' | undefined
    if (this.save.district === 'hillside') {
      const keeperPosition = this.hillsideStreet.visible ? new Vector3(0, gentleStreetHeight(0, 2.2), 2.2) : this.normalAt(0.47, -0.14).multiplyScalar(PLANET_RADIUS)
      if (position.distanceTo(keeperPosition) < 2) next = 'station-keeper'
      const stationDoor = this.hillsideStreet.visible ? this.streetStationDoorPosition : this.stationDoorPosition
      if (this.save.quest.stationNameRestored && position.distanceTo(stationDoor) < 2.45) next = 'station-door'
      for (const clue of this.hillsideStreet.visible ? this.streetClues : this.clues) {
        if (!clue.mesh.visible) continue
        const cluePosition = new Vector3(...clue.position)
        if (position.distanceTo(cluePosition) < 1.85) next = clue
      }
    }
    const activeSideMarkers = this.hillsideStreet.visible ? this.streetSideMarkers : this.sideMarkers
    for (const marker of activeSideMarkers) {
      if (marker.district !== this.save.district || !marker.mesh.visible) continue
      const markerPosition = new Vector3(...marker.position)
      if (position.distanceTo(markerPosition) < 1.85) next = marker
    }
    if (next !== this.nearby) {
      this.nearby = next
      this.events.onHud(this.currentHud())
    }
  }

  private hint(): string {
    if (this.save.quest.stationNameRestored) return 'The station is no longer lost.'
    return `${this.save.quest.completedClues.length}/3 name fragments remembered.`
  }

  private dialogue(): string {
    if (this.save.quest.stationNameRestored) return 'Sunset Loop has found its name.'
    return 'The town is waiting for its station to remember.'
  }

  private stationKeeperDialogue(): string {
    if (this.save.quest.stationNameRestored && (this.save.quest.lantern !== 'complete' || this.save.quest.chorus !== 'complete')) return '“The sign is bright again. If you have time, the signal and hill bell still need a little care.”'
    if (this.save.quest.stationNameRestored) return '“You did it. The last train has a name to come home to.”'
    return '“The station sign has faded. Find the three amber beacons, and bring our name back.”'
  }

  private emitHud(hint: string, dialogue: string): void {
    this.displayedHint = hint
    this.displayedDialogue = dialogue
    this.events.onHud(this.currentHud())
  }

  private currentHud(): GameHud {
    const nearbyLabel = this.nearby === 'station-keeper' ? 'Talk' : this.nearby === 'station-door' ? 'Enter station' : this.nearby ? `Investigate ${this.nearby.label}` : ''
    const showNpcDialogue = !this.inStation && this.nearby === 'station-keeper'
    return {
      hint: showNpcDialogue ? 'Tap Talk to speak with the station keeper.' : this.displayedHint || this.hint(),
      dialogue: showNpcDialogue ? this.stationKeeperDialogue() : this.displayedDialogue || this.dialogue(),
      nearbyLabel: this.inStation ? '' : nearbyLabel,
      showNpcDialogue,
      quest: this.save.quest,
      inStation: this.inStation,
      coatColor: this.save.coatColor,
      district: this.save.district,
      identity: this.save.identity,
    }
  }

  private resolveSideMarker(marker: SideMarker): void {
    const stage = this.save.quest[marker.sideQuest]
    if (stage === 'complete' || stage === 'locked') return
    this.save.quest = advanceSideQuest(this.save.quest, marker.sideQuest)
    if (marker.id === 'signal-repair') {
      this.signalBulb?.color.set('#78c271')
      this.signalBulb?.emissive.set('#4f9e5a')
      this.streetSignalBulb?.color.set('#78c271')
      this.streetSignalBulb?.emissive.set('#4f9e5a')
      this.playTone(698)
    }
    if (marker.id === 'bell-chime') {
      this.chorusFireflies.visible = true
      this.streetChorusFireflies.visible = true
      this.streetBellGlow?.emissive.set('#d8894d')
      if (this.streetBellGlow) this.streetBellGlow.emissiveIntensity = 0.6
      this.playTone(880)
    }
    if (marker.id === 'harbour-pump') {
      this.harbourBeacon?.color.set('#74c888')
      this.harbourBeacon?.emissive.set('#4c9b67')
      this.playTone(740)
    }
    if (marker.id === 'observatory-scope') {
      this.observatoryBeacon?.color.set('#9ce0ce')
      this.observatoryBeacon?.emissive.set('#4a9f8c')
      this.playTone(932)
    }
    this.updateSideQuestMarkers()
    this.soundscape.setProfile(soundscapeProfile(this.save.quest))
    this.persist()
    const finished = this.save.quest[marker.sideQuest] === 'complete'
    this.emitHud(marker.text, finished ? marker.sideQuest === 'lantern' ? 'Green Light Home is complete. The signal will guide the last train.' : 'The Morning Chorus is complete. The town has found its song.' : marker.sideQuest === 'lantern' ? 'Take the lens to the teal signal marker.' : 'Take the tune to the rose bell marker.')
  }

  private updateSideQuestMarkers(): void {
    for (const marker of [...this.sideMarkers, ...this.streetSideMarkers]) {
      const stage = this.save.quest[marker.sideQuest]
      marker.mesh.visible = stage === marker.requiredStage
    }
    this.chorusFireflies.visible = this.save.quest.chorus === 'complete'
    this.streetChorusFireflies.visible = this.save.quest.chorus === 'complete'
  }

  private enterStation(): void {
    if (!this.save.quest.stationNameRestored) return
    this.inStation = true
    this.joystick.set(0, 0)
    this.root.visible = false
    this.hillsideStreet.visible = false
    this.ambient.visible = false
    this.player.visible = false
    this.stationInterior.visible = true
    this.soundscape.setProfile(soundscapeProfile(this.save.quest, true))
    this.emitHud('The map shows the old circle reaching farther than the town remembers.', 'Choose a coat colour, or take the short line down to Harbour Works.')
  }

  private persist(write = true): void {
    this.save.playerNormal = [this.currentNormal.x, this.currentNormal.y, this.currentNormal.z]
    if (write) writeSave(window.localStorage, this.save)
  }

  private playTone(frequency: number): void {
    this.soundscape.playCue(frequency)
  }

  private resize(): void {
    const width = Math.max(this.container.clientWidth, 1)
    const height = Math.max(this.container.clientHeight, 1)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  private handleVisibilityChange(): void {
    if (!shouldRender(document.visibilityState) || this.animationFrame) return
    this.clock.last = performance.now()
    this.tick()
  }
}
