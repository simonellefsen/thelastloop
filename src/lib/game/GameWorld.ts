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
import { isWithinWalkableCap, tangentForward } from './math'
import { nextPassengerIdentity } from './presence'
import { animationTime, shouldRender } from './runtime'
import { advanceSideQuest, defaultQuest, resolveClue, unlockHarbour, unlockObservatory } from './quest'
import { coatColors, nextCoatColor } from './style'
import { Soundscape, soundscapeProfile } from './soundscape'
import { readSave, writeSave } from './storage'
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
  private readonly sideMarkers: SideMarker[] = []
  private readonly ambient = new Group()
  private readonly harbourAmbient = new Group()
  private readonly resizeObserver: ResizeObserver
  private readonly onKeyDown = (event: KeyboardEvent) => this.keys.add(event.key.toLowerCase())
  private readonly onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase())
  private readonly onResize = () => this.resize()
  private readonly onVisibilityChange = () => this.handleVisibilityChange()
  private currentNormal = new Vector3()
  private playerForward = new Vector3(0, 0, -1)
  private joystick = new Vector2()
  private started = false
  private animationFrame = 0
  private entryCameraProgress = 1
  private nearby: Clue | SideMarker | 'station-keeper' | 'station-door' | undefined
  private stationSign: Sprite | undefined
  private stationDoorPosition = new Vector3()
  private playerCoat: MeshLambertMaterial | undefined
  private signalBulb: MeshLambertMaterial | undefined
  private harbourBeacon: MeshLambertMaterial | undefined
  private observatoryBeacon: MeshLambertMaterial | undefined
  private readonly chorusFireflies = new Group()
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
    this.emitHud('Find three fragments of the station name.', 'Walk to the glowing amber markers.')
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
    this.root.visible = true
    this.ambient.visible = true
    this.player.visible = true
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
    this.addClue('signal', 'Signal box', 0.56, -0.52, 'The brass plate reads: “Every last train returns in a LOOP.”')
    this.addClue('mural', 'Market mural', 0.43, 0.22, 'A faded market mural shows the town under a gold SUNSET.')
    this.addClue('bell', 'Hill bell', 0.27, 0.72, 'The hill bell rings once: the old sign needs the last word—LOOP.')
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
    const glow = new Mesh(new SphereGeometry(0.16, 8, 6), new MeshLambertMaterial({ color: '#f8dc69', emissive: new Color('#f3b34c'), emissiveIntensity: 0.8, flatShading: true }))
    glow.position.y = 0.58
    marker.add(glow)
    const labelSprite = this.createSign(label, '#fff5d8', 256, 72)
    labelSprite.scale.set(1.45, 0.4, 1)
    labelSprite.position.y = 1.06
    marker.add(labelSprite)
    this.placeOnPlanet(marker, latitude, longitude, 0)
    this.root.add(marker)
    const position = marker.getWorldPosition(new Vector3())
    this.clues.push({ id, label, text, mesh: marker, position: [position.x, position.y, position.z] })
  }

  private addSideQuestLandmarks(): void {
    this.addSignalTower()
    this.addBellLandmark()
    this.addSideMarker('lens-cache', 'Depot lens', 'lantern', 0.65, -0.82, 'A warm brass lens waits in the depot crate. Take it back to the signal.', 'first')
    this.addSideMarker('signal-repair', 'Fit lens', 'lantern', 0.56, -0.52, 'The signal wakes green. One more corner of the loop feels safe after dusk.', 'second')
    this.addSideMarker('tune-card', 'Tune card', 'chorus', 0.45, 0.36, 'A small tune card reads: “Three notes for the hill bell.”', 'first')
    this.addSideMarker('bell-chime', 'Ring bell', 'chorus', 0.27, 0.72, 'The hill bell answers the tune. Birds lift from the rooftops in reply.', 'second')
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
    this.placeOnPlanet(tower, 0.56, -0.52, 0)
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
    this.placeOnPlanet(bell, 0.27, 0.72, 0.4)
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
    this.ambient.visible = false
    this.root.remove(this.player)
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
    this.ambient.visible = false
    this.harbourWorld.visible = false
    this.harbourAmbient.visible = false
    this.root.remove(this.player)
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
    if (!this.stationSign) return
    const replacement = this.createSign(text, color)
    this.stationSign.material.map?.dispose()
    this.stationSign.material.dispose()
    this.stationSign.material = replacement.material
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
    this.soundscape.update(this.clock.elapsed)
    this.renderer.render(this.scene, this.camera)
    this.animationFrame = requestAnimationFrame(this.tick)
  }

  private updatePlayer(delta: number): void {
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
      if (isWithinWalkableCap(candidateNormal, WALKABLE_ANCHOR, WALKABLE_ANGLE)) {
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

  private findNearby(position: Vector3): void {
    let next: Clue | SideMarker | 'station-keeper' | 'station-door' | undefined
    if (this.save.district === 'hillside') {
      const keeperPosition = this.normalAt(0.47, -0.14).multiplyScalar(PLANET_RADIUS)
      if (position.distanceTo(keeperPosition) < 2) next = 'station-keeper'
      if (this.save.quest.stationNameRestored && position.distanceTo(this.stationDoorPosition) < 2.45) next = 'station-door'
      for (const clue of this.clues) {
        if (!clue.mesh.visible) continue
        const cluePosition = new Vector3(...clue.position)
        if (position.distanceTo(cluePosition) < 1.85) next = clue
      }
    }
    for (const marker of this.sideMarkers) {
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

  private emitHud(hint: string, dialogue: string): void {
    this.displayedHint = hint
    this.displayedDialogue = dialogue
    this.events.onHud(this.currentHud())
  }

  private currentHud(): GameHud {
    const nearbyLabel = this.nearby === 'station-keeper' ? 'Talk' : this.nearby === 'station-door' ? 'Enter station' : this.nearby?.label ?? ''
    return {
      hint: this.displayedHint || this.hint(),
      dialogue: this.displayedDialogue || this.dialogue(),
      nearbyLabel: this.inStation ? '' : nearbyLabel,
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
      this.playTone(698)
    }
    if (marker.id === 'bell-chime') {
      this.chorusFireflies.visible = true
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
    for (const marker of this.sideMarkers) {
      const stage = this.save.quest[marker.sideQuest]
      marker.mesh.visible = stage === marker.requiredStage
    }
    this.chorusFireflies.visible = this.save.quest.chorus === 'complete'
  }

  private enterStation(): void {
    if (!this.save.quest.stationNameRestored) return
    this.inStation = true
    this.joystick.set(0, 0)
    this.root.visible = false
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
