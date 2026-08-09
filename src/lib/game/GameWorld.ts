import {
  AmbientLight,
  BoxGeometry,
  CatmullRomCurve3,
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
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { entryCameraProfile, streetArrivalProfile, type StreetCameraProfile } from './camera'
import { objectiveDirection, screenRelativeStreetDirection } from './controls'
import { ATLAS_JOURNEY_PORTION, createRailJourney, railAtlasProgress, RAIL_JOURNEY_SECONDS, REDUCED_MOTION_RAIL_JOURNEY_SECONDS } from './journey'
import { gentleStreetHeight, isOutsideSphericalBlockers, isOutsideStreetBlockers, isWithinWalkableCap, tangentForward } from './math'
import { nextPassengerIdentity } from './presence'
import { globalRailStops, nextGlobalRailStop } from './railway'
import { restorationLightProfile, type RestorationDistrict } from './restoration'
import { animationTime, nextRenderResolution, shouldRender } from './runtime'
import { advanceSideQuest, defaultQuest, isJourneyComplete, resolveClue, unlockHarbour, unlockObservatory } from './quest'
import { coatColors, nextCoatColor } from './style'
import { Soundscape, soundscapeProfile } from './soundscape'
import { freshStorySave, readSave, writeSave } from './storage'
import type { SphericalBlocker, StreetBlocker } from './math'
import type { ClueId, DistrictId, GameHud, GameSave, PlayerController, RailJourney, SideQuestId, SideQuestStage, WorldInteractable } from './types'

const UP = new Vector3(0, 1, 0)
const PLANET_RADIUS = 10
const WALKABLE_ANCHOR = new Vector3(0, 1, 0)
const WALKABLE_ANGLE = 0.82
const harbourStreetHeight = (x: number, z: number): number => -0.0016 * (x * x + z * z) + Math.sin(x * 0.35) * Math.cos(z * 0.27) * 0.055
const observatoryStreetHeight = (x: number, z: number): number => -0.0012 * (x * x + z * z) + Math.cos(x * 0.28 + z * 0.12) * 0.075

export interface GameWorldEvents {
  onHud(hud: GameHud): void
  onArrival(district: DistrictId): void
  onSound(enabled: boolean): void
  onReducedMotion(enabled: boolean): void
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
  // The title is a single atlas, not three isolated demo planets.  It stays
  // deliberately low-detail so the whole connected loop reads at phone scale.
  private readonly titleAtlas = new Group()
  private readonly titleTrain = new Group()
  private readonly titleRouteBeacons = new Map<DistrictId, MeshLambertMaterial>()
  private titleRoute: CatmullRomCurve3 | undefined
  private readonly hillsideStreet = new Group()
  private readonly harbourStreet = new Group()
  private readonly observatoryStreet = new Group()
  private readonly harbourWorld = new Group()
  private readonly observatoryWorld = new Group()
  private readonly player = new Group()
  private readonly stationInterior = new Group()
  private readonly journeyScene = new Group()
  private readonly journeyTrain = new Group()
  private journeyRoute: CatmullRomCurve3 | undefined
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
  private readonly harbourStreetSideMarkers: SideMarker[] = []
  private readonly observatoryStreetSideMarkers: SideMarker[] = []
  private readonly blockersByDistrict: Record<DistrictId, SphericalBlocker[]> = { hillside: [], harbour: [], observatory: [] }
  private readonly streetBlockers: StreetBlocker[] = []
  private readonly harbourStreetBlockers: StreetBlocker[] = []
  private readonly observatoryStreetBlockers: StreetBlocker[] = []
  private readonly ambient = new Group()
  private readonly harbourAmbient = new Group()
  private readonly streetLife = new Group()
  private readonly harbourStreetLife = new Group()
  private readonly observatoryStreetLife = new Group()
  private readonly resizeObserver: ResizeObserver
  private readonly visualViewport = window.visualViewport
  private readonly onKeyDown = (event: KeyboardEvent) => this.keys.add(event.key.toLowerCase())
  private readonly onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase())
  private readonly onResize = () => this.resize()
  private readonly onVisibilityChange = () => this.handleVisibilityChange()
  private renderPixelRatio = 1
  private maxPixelRatio = 1
  private slowFrames = 0
  private fastFrames = 0
  private currentNormal = new Vector3()
  private streetPosition = new Vector3(0, 0, 7.4)
  private streetForward = new Vector3(0, 0, -1)
  private streetCameraForward = new Vector3(0, 0, -1)
  private streetVelocity = new Vector3()
  private playerForward = new Vector3(0, 0, -1)
  private joystick = new Vector2()
  private started = false
  private titlePreviewDistrict: DistrictId = 'hillside'
  private animationFrame = 0
  private entryCameraProgress = 1
  private lastStreetSaveTime = 0
  private nearby: Clue | SideMarker | 'station-keeper' | 'station-door' | 'harbour-keeper' | 'moon-warden' | undefined
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
  private readonly harbourRestorationLights: MeshLambertMaterial[] = []
  private readonly observatoryRestorationLights: MeshLambertMaterial[] = []
  private readonly chorusFireflies = new Group()
  private readonly streetChorusFireflies = new Group()
  private save: GameSave
  private soundscape: Soundscape
  private inStation = false
  private railJourney: { from: DistrictId; to: DistrictId; elapsed: number; duration: number; firstVisit: boolean } | undefined
  private journeyHudPercent = -1
  private displayedHint = ''
  private displayedDialogue = ''
  private objectiveCueKey = ''

  constructor(private readonly container: HTMLElement, private readonly events: GameWorldEvents) {
    this.save = readSave(window.localStorage)
    this.titlePreviewDistrict = this.save.district
    this.currentNormal.fromArray(this.save.playerNormal).normalize()
    this.soundscape = new Soundscape(this.save.soundEnabled)

    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.65)
    this.renderPixelRatio = this.maxPixelRatio
    this.renderer.setPixelRatio(this.renderPixelRatio)
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
    this.createHarbourStreetWorld()
    this.createObservatoryWorld()
    this.createObservatoryStreetWorld()
    this.updateRestorationLighting()
    this.createStationInterior()
    this.createRailJourneyScene()
    this.createAmbientLife()
    this.resize()
    this.resizeObserver = new ResizeObserver(this.onResize)
    this.resizeObserver.observe(container)
    // Safari can change its visible viewport when the address bar expands or
    // collapses without delivering the element resize at the same instant.
    // Listen to both signals so the camera projection and renderer never use
    // the stale, taller viewport for a frame.
    this.visualViewport?.addEventListener('resize', this.onResize)
    this.visualViewport?.addEventListener('scroll', this.onResize)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.emitHud('Enter the town when you are ready.', 'A small world remembers every path.')
    this.tick()
  }

  getSoundEnabled(): boolean {
    return this.save.soundEnabled
  }

  getReducedMotion(): boolean {
    return this.save.reducedMotion
  }

  /** Stores an explicit new-story save; App reloads to rebuild every scene cleanly. */
  startFresh(): void {
    this.save = freshStorySave(this.save)
    writeSave(window.localStorage, this.save)
  }

  setTitlePreview(district: DistrictId): void {
    if (this.started) return
    this.titlePreviewDistrict = district
    this.hillsideStreet.visible = false
    this.harbourStreet.visible = false
    this.observatoryStreet.visible = false
    // Keep the complete world visible while the copy changes.  Selecting a
    // route should never make two-thirds of the title planet disappear.
    this.root.visible = true
    this.ambient.visible = true
    this.harbourWorld.visible = false
    this.harbourAmbient.visible = false
    this.observatoryWorld.visible = false
    this.titleAtlas.rotation.y = district === 'hillside' ? 0 : district === 'harbour' ? -0.24 : 0.24
    for (const [beaconDistrict, material] of this.titleRouteBeacons) {
      material.emissiveIntensity = beaconDistrict === district ? 1.1 : 0.16
    }
  }

  start(): void {
    this.setTitlePreview(this.titlePreviewDistrict)
    const resumesSelectedDistrict = this.save.district === this.titlePreviewDistrict
    this.started = true
    this.entryCameraProgress = 0
    this.save.district = this.titlePreviewDistrict
    this.save.quest.introductionSeen = true
    this.soundscape.start(soundscapeProfile(this.save.quest))
    if (this.titlePreviewDistrict === 'harbour') {
      this.showHarbour(!resumesSelectedDistrict)
      this.persist()
      this.emitHud('The tide clock is still waiting at Harbour Works.', 'Find the blue valve, then return it to the dock pump.')
      return
    }
    if (this.titlePreviewDistrict === 'observatory') {
      this.showObservatory(!resumesSelectedDistrict)
      this.persist()
      this.emitHud('Moonhill is quiet beneath the stars.', 'Find the starlight lens, then align the telescope.')
      return
    }
    this.enterHillsideStreet(!resumesSelectedDistrict)
    this.persist()
    this.emitHud('Find three fragments of the station name.', 'Follow the amber beacons and tap Investigate when the button appears.')
  }

  setJoystick(input: { x: number; y: number }): void {
    if (this.railJourney) return
    this.joystick.set(input.x, input.y)
  }

  interact(): void {
    if (!this.started || this.railJourney || !this.nearby) return
    this.playTone(this.nearby === 'station-keeper' || this.nearby === 'station-door' ? 392 : 523)
    if (this.nearby === 'station-door') {
      this.enterStation()
      return
    }
    if (this.nearby === 'station-keeper') {
      if (this.save.quest.stationNameRestored && (this.save.quest.lantern !== 'complete' || this.save.quest.chorus !== 'complete')) this.emitHud('Sunset Loop has a name again, but the signal is dark and the hill has forgotten its song.', 'Follow the teal and rose markers for two small side routes.')
      else if (this.save.quest.stationNameRestored) this.enterStation()
      else this.emitHud('The old sign is blank again. The town kept its name in three little stories.', 'Look for the signal box, market mural and hill bell.')
      return
    }
    if (this.nearby === 'harbour-keeper') {
      this.emitHud('Dock keeper listened.', this.harbourKeeperDialogue())
      return
    }
    if (this.nearby === 'moon-warden') {
      this.emitHud('Moonhill warden listened.', this.moonWardenDialogue())
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

  toggleReducedMotion(): void {
    this.save.reducedMotion = !this.save.reducedMotion
    this.persist()
    this.events.onReducedMotion(this.save.reducedMotion)
    this.emitHud(this.save.reducedMotion ? 'Reduced motion is on.' : 'Reduced motion is off.', this.save.reducedMotion ? 'The title orbit and decorative life are paused.' : 'The small world is moving again.')
  }

  leaveStation(): void {
    if (!this.inStation || this.railJourney) return
    this.inStation = false
    this.stationInterior.visible = false
    this.enterHillsideStreet(true)
    this.save.district = 'hillside'
    this.soundscape.setProfile(soundscapeProfile(this.save.quest))
    this.persist()
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
    if (!this.inStation || this.railJourney || !this.save.quest.stationNameRestored) return
    this.boardDistrict('harbour')
  }

  travelToObservatory(): void {
    if (!this.inStation || this.railJourney || !this.save.quest.stationNameRestored) return
    this.boardDistrict('observatory')
  }

  /** Continues in the authoritative circle: Ravnbro → Harbour → Moonhill → Ravnbro. */
  continueRailLoop(): void {
    if (this.railJourney || this.inStation || !this.save.quest.stationNameRestored) return
    this.boardDistrict(nextGlobalRailStop(this.save.district).nextDistrict)
  }

  returnToStation(): void {
    if (this.railJourney || this.inStation || this.save.district === 'hillside') return
    this.beginRailJourney('hillside', false)
  }

  private boardDistrict(to: DistrictId): void {
    if (to === 'harbour') {
      const firstVisit = this.save.quest.harbour === 'locked'
      this.save.quest = unlockHarbour(this.save.quest)
      this.beginRailJourney(to, firstVisit)
      return
    }
    if (to === 'observatory') {
      const firstVisit = this.save.quest.observatory === 'locked'
      this.save.quest = unlockObservatory(this.save.quest)
      this.beginRailJourney(to, firstVisit)
      return
    }
    this.beginRailJourney(to, false)
  }

  private beginRailJourney(to: DistrictId, firstVisit: boolean): void {
    const from = this.save.district
    if (from === to || this.railJourney) return
    this.persist()
    this.railJourney = {
      from,
      to,
      elapsed: 0,
      duration: this.prefersReducedMotion() ? REDUCED_MOTION_RAIL_JOURNEY_SECONDS : RAIL_JOURNEY_SECONDS,
      firstVisit,
    }
    this.journeyHudPercent = -1
    this.inStation = false
    this.joystick.set(0, 0)
    this.nearby = undefined
    this.root.visible = false
    this.hillsideStreet.visible = false
    this.harbourStreet.visible = false
    this.observatoryStreet.visible = false
    this.harbourWorld.visible = false
    this.observatoryWorld.visible = false
    this.ambient.visible = false
    this.harbourAmbient.visible = false
    this.stationInterior.visible = false
    this.player.visible = false
    this.journeyScene.visible = true
    this.playTone(to === 'observatory' ? 622 : 554)
    this.emitHud('The conductor closes the door and the little train eases onto the loop.', 'Enjoy the rails — controls return when the next town comes into view.')
  }

  private finishRailJourney(): void {
    const journey = this.railJourney
    if (!journey) return
    this.railJourney = undefined
    this.journeyHudPercent = -1
    this.journeyScene.visible = false
    if (journey.to === 'harbour') {
      this.showHarbour(journey.firstVisit)
    } else if (journey.to === 'observatory') {
      this.showObservatory(journey.firstVisit)
    } else {
      this.arriveAtStation()
    }
    this.persist()
    if (journey.to === 'harbour') {
      this.emitHud(journey.firstVisit ? 'The old loop carries you down to Harbour Works. The tide clock has stopped.' : 'Harbour Works is waiting by the water.', journey.firstVisit ? 'Find the blue valve, then return it to the dock pump.' : 'Follow the blue marker if the tide clock still needs help.')
    } else if (journey.to === 'observatory') {
      this.emitHud(journey.firstVisit ? 'The loop climbs to Moonhill. Its telescope has lost the moon signal.' : 'Moonhill Observatory is still listening for the signal.', journey.firstVisit ? 'Find the starlight lens, then align the telescope.' : 'Follow the violet marker if the telescope still needs help.')
    } else {
      this.emitHud('The little train returns you to Sunset Loop.', 'Harbour Works and Moonhill are now part of the same small circle.')
    }
    this.events.onArrival(journey.to)
  }

  private arriveAtStation(): void {
    this.root.add(this.player)
    this.harbourWorld.visible = false
    this.harbourStreet.visible = false
    this.harbourAmbient.visible = false
    this.observatoryWorld.visible = false
    this.observatoryStreet.visible = false
    this.root.visible = false
    this.ambient.visible = false
    this.player.visible = false
    this.stationInterior.visible = true
    this.inStation = true
    this.save.district = 'hillside'
    this.currentNormal.copy(this.normalAt(0.38, -0.42))
    this.soundscape.setProfile(soundscapeProfile(this.save.quest, true))
  }

  dispose(): void {
    if (this.started && !this.inStation) this.persist()
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver.disconnect()
    this.visualViewport?.removeEventListener('resize', this.onResize)
    this.visualViewport?.removeEventListener('scroll', this.onResize)
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
    this.createTitleAtlas()
    return ground
  }

  /**
   * A readable map of the entire route at title scale.  These are original,
   * purpose-built silhouettes rather than the playable districts copied three
   * times.  Their job is to make the small planet feel settled all the way
   * around before the detailed district streams in at street scale.
   */
  private createTitleAtlas(): void {
    this.root.add(this.titleAtlas)
    this.addTitleSettlement('ravnbro', 0.74, -1.7, 0.25)
    this.addTitleSettlement('harbour', 0.94, 0.18, -0.55)
    this.addTitleSettlement('moonhill', 0.8, 1.82, 0.45)
    this.addTitleWaystation(1.17, -0.78, '#d4ae57')
    this.addTitleWaystation(1.14, 0.94, '#5f87a2')
    this.addTitleWaystation(1.28, 2.68, '#8b74aa')
    this.addTitleGrove(1.22, -2.62)
    this.addTitleGrove(1.31, 2.27)
    this.addTitleRailRoute()
  }

  /** A continuous, visible route is the title world's connective tissue. */
  private addTitleRailRoute(): void {
    const routePoints = [
      [globalRailStops[0].titleLatitude, globalRailStops[0].titleLongitude], [1.17, -0.78],
      [globalRailStops[1].titleLatitude, globalRailStops[1].titleLongitude], [1.14, 0.94],
      [globalRailStops[2].titleLatitude, globalRailStops[2].titleLongitude], [1.28, 2.68], [1.31, 2.27], [1.22, -2.62],
    ].map(([latitude, longitude]) => this.normalAt(latitude, longitude).multiplyScalar(10.62))
    this.titleRoute = new CatmullRomCurve3(routePoints, true, 'centripetal')
    const ballast = new Mesh(
      new TubeGeometry(this.titleRoute, 160, 0.105, 5, true),
      new MeshLambertMaterial({ color: '#36535b', flatShading: true }),
    )
    const rail = new Mesh(
      new TubeGeometry(this.titleRoute, 160, 0.052, 5, true),
      new MeshLambertMaterial({ color: '#e6c65d', emissive: new Color('#9a7334'), emissiveIntensity: 0.25, flatShading: true }),
    )
    this.titleAtlas.add(ballast, rail)
    this.createTitleTrain()
  }

  private createTitleTrain(): void {
    const chassis = new Mesh(new BoxGeometry(0.34, 0.16, 0.72), new MeshLambertMaterial({ color: '#284a52', flatShading: true }))
    chassis.position.y = 0.12
    this.titleTrain.add(chassis)
    const engine = new Mesh(new BoxGeometry(0.34, 0.29, 0.36), new MeshLambertMaterial({ color: '#c96149', flatShading: true }))
    engine.position.set(0, 0.3, -0.13)
    this.titleTrain.add(engine)
    const cabin = new Mesh(new BoxGeometry(0.31, 0.37, 0.25), new MeshLambertMaterial({ color: '#e7d3a2', flatShading: true }))
    cabin.position.set(0, 0.39, 0.2)
    this.titleTrain.add(cabin)
    const lamp = new Mesh(new SphereGeometry(0.065, 6, 5), new MeshLambertMaterial({ color: '#fff0a1', emissive: new Color('#d9953e'), emissiveIntensity: 0.8, flatShading: true }))
    lamp.position.set(0, 0.31, -0.33)
    this.titleTrain.add(lamp)
    this.titleAtlas.add(this.titleTrain)
  }

  private addTitleSettlement(kind: 'ravnbro' | 'harbour' | 'moonhill', latitude: number, longitude: number, heading: number): void {
    const settlement = new Group()
    const baseColor = kind === 'harbour' ? '#7da69e' : kind === 'moonhill' ? '#7f8aa0' : '#b8a873'
    const base = new Mesh(new CylinderGeometry(1.85, 2.15, 0.18, 8), new MeshLambertMaterial({ color: baseColor, flatShading: true }))
    base.position.y = 0.1
    settlement.add(base)
    const road = new Mesh(new BoxGeometry(3.25, 0.07, 0.38), new MeshLambertMaterial({ color: kind === 'harbour' ? '#426e78' : '#556c6f', flatShading: true }))
    road.position.y = 0.22
    settlement.add(road)
    const walls = kind === 'harbour' ? ['#b9644d', '#e5d4aa', '#d78356'] : kind === 'moonhill' ? ['#d7d3be', '#7285a7', '#b8a4c6'] : ['#a94f3f', '#d6c26d', '#d8ded0']
    const roofs = kind === 'harbour' ? ['#264b52', '#d7a447', '#385e62'] : kind === 'moonhill' ? ['#3d4b76', '#59658a', '#4e557e'] : ['#344c51', '#b86d50', '#4f6870']
    for (let index = 0; index < 3; index += 1) {
      const house = new Group()
      const body = new Mesh(new BoxGeometry(0.92 + (index % 2) * 0.16, 0.72 + (index === 1 ? 0.22 : 0), 0.76), new MeshLambertMaterial({ color: walls[index], flatShading: true }))
      body.position.y = 0.55
      house.add(body)
      const roof = new Mesh(new ConeGeometry(0.72 + (index % 2) * 0.1, 0.42, 4), new MeshLambertMaterial({ color: roofs[index], flatShading: true }))
      roof.rotation.y = Math.PI / 4
      roof.position.y = 1.12 + (index === 1 ? 0.22 : 0)
      house.add(roof)
      house.position.set(-1.05 + index * 1.05, 0.18, index === 1 ? -0.62 : 0.62)
      house.rotation.y = index === 1 ? Math.PI / 2 : 0
      settlement.add(house)
    }
    if (kind === 'harbour') {
      const mast = new Mesh(new BoxGeometry(0.1, 2.1, 0.1), new MeshLambertMaterial({ color: '#c9784f', flatShading: true }))
      mast.position.set(1.1, 1.25, -0.55)
      settlement.add(mast)
      const arm = new Mesh(new BoxGeometry(1.34, 0.1, 0.1), new MeshLambertMaterial({ color: '#c9784f', flatShading: true }))
      arm.position.set(1.68, 2.1, -0.55)
      settlement.add(arm)
      const boat = new Mesh(new BoxGeometry(1.25, 0.24, 0.5), new MeshLambertMaterial({ color: '#f0dfbd', flatShading: true }))
      boat.position.set(-0.3, 0.37, -1.08)
      settlement.add(boat)
    } else if (kind === 'moonhill') {
      const dome = new Mesh(new SphereGeometry(0.68, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), new MeshLambertMaterial({ color: '#48527f', flatShading: true }))
      dome.position.set(0, 0.9, -0.12)
      settlement.add(dome)
      const scope = new Mesh(new CylinderGeometry(0.12, 0.16, 1.25, 7), new MeshLambertMaterial({ color: '#eee5c8', flatShading: true }))
      scope.rotation.z = Math.PI / 3
      scope.position.set(0.78, 1.38, -0.12)
      settlement.add(scope)
    } else {
      const tower = new Mesh(new BoxGeometry(0.42, 1.74, 0.42), new MeshLambertMaterial({ color: '#9d4e42', flatShading: true }))
      tower.position.set(0, 1.06, -0.2)
      settlement.add(tower)
      const spire = new Mesh(new ConeGeometry(0.38, 0.68, 4), new MeshLambertMaterial({ color: '#344c51', flatShading: true }))
      spire.position.set(0, 2.24, -0.2)
      settlement.add(spire)
    }
    const district: DistrictId = kind === 'ravnbro' ? 'hillside' : kind === 'moonhill' ? 'observatory' : 'harbour'
    const beaconColor = kind === 'harbour' ? '#82d4dc' : kind === 'moonhill' ? '#c4a9ef' : '#f4d55c'
    const beaconMaterial = new MeshLambertMaterial({ color: beaconColor, emissive: new Color(beaconColor), emissiveIntensity: district === 'hillside' ? 1.1 : 0.16, flatShading: true })
    const beacon = new Mesh(new SphereGeometry(0.16, 7, 5), beaconMaterial)
    beacon.position.set(0, 2.82, 0.06)
    settlement.add(beacon)
    this.titleRouteBeacons.set(district, beaconMaterial)
    this.placeOnPlanet(settlement, latitude, longitude, heading)
    this.titleAtlas.add(settlement)
  }

  private addTitleWaystation(latitude: number, longitude: number, color: string): void {
    const stop = new Group()
    const platform = new Mesh(new BoxGeometry(1.25, 0.14, 0.8), new MeshLambertMaterial({ color: '#ded5af', flatShading: true }))
    platform.position.y = 0.12
    stop.add(platform)
    const shelter = new Mesh(new BoxGeometry(0.72, 0.62, 0.38), new MeshLambertMaterial({ color, flatShading: true }))
    shelter.position.set(-0.1, 0.47, 0)
    stop.add(shelter)
    const roof = new Mesh(new ConeGeometry(0.6, 0.32, 4), new MeshLambertMaterial({ color: '#304a51', flatShading: true }))
    roof.rotation.y = Math.PI / 4
    roof.position.set(-0.1, 0.94, 0)
    stop.add(roof)
    const lamp = new Mesh(new SphereGeometry(0.12, 6, 5), new MeshLambertMaterial({ color: '#f5d56c', emissive: new Color('#c98a3e'), emissiveIntensity: 0.58, flatShading: true }))
    lamp.position.set(0.5, 0.86, 0.12)
    stop.add(lamp)
    this.placeOnPlanet(stop, latitude, longitude, 0)
    this.titleAtlas.add(stop)
  }

  private addTitleGrove(latitude: number, longitude: number): void {
    const grove = new Group()
    const trunkMaterial = new MeshLambertMaterial({ color: '#694c3d', flatShading: true })
    for (let index = 0; index < 4; index += 1) {
      const tree = new Group()
      const trunk = new Mesh(new CylinderGeometry(0.07, 0.12, 0.7, 5), trunkMaterial)
      trunk.position.y = 0.35
      tree.add(trunk)
      const crown = new Mesh(new ConeGeometry(0.48 + (index % 2) * 0.1, 1.08, 6), new MeshLambertMaterial({ color: index % 2 ? '#3f815d' : '#327052', flatShading: true }))
      crown.position.y = 1.0
      tree.add(crown)
      tree.position.set((index % 2 - 0.5) * 0.82, 0.1, (Math.floor(index / 2) - 0.5) * 0.86)
      grove.add(tree)
    }
    this.placeOnPlanet(grove, latitude, longitude, 0)
    this.titleAtlas.add(grove)
  }

  private createHillsideStreetWorld(): void {
    this.hillsideStreet.visible = false
    // This is intentionally much wider than the playable town. The terrain
    // falls gently toward the fog, keeping the street locally upright while
    // removing the old rectangular "end of the map" silhouette.
    this.hillsideStreet.add(this.createStreetHorizon(138, 126, gentleStreetHeight, '#79bd68'))

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
    this.addStationRailCrossing()
    this.addStationShunter()
    this.addFlatBuilding(6.8, -4.7, '#d8d4c5', '#be7654', 'BAKERY')
    this.addFlatBuilding(-6.8, -7.3, '#e2c971', '#4e6970', 'HOME')
    this.addFlatBuilding(-7.1, 5.3, '#c9ded6', '#50666a', 'DEPOT')
    this.addRavnbroLaneThreshold()
    this.addRavnbroParcelLane()
    this.addRavnbroDepotYard()
    this.addRavnbroFreightSpur()
    this.addRavnbroNorthYardLoopLink()
    this.addStreetLoopSection('hillside', this.hillsideStreet, gentleStreetHeight, [
      [-14.5, 8.4], [-15.2, 1.5], [-13.8, -6.5], [-8.8, -12.2], [0, -14.1], [8.8, -12.2], [14.2, -6], [15.1, 2.4], [12.2, 9.4], [4.5, 13.2], [-5.5, 13.6],
    ], 'TO REEDWATER VIADUCT', -11.2, 10.2)
    this.addRavnbroOutboundRail()
    this.addMarketFold()
    this.addMarketCourtyard()
    this.addRavnbroClockmakersCourt()
    this.addRavnbroCoppersmithLane()
    this.addRavnbroNorthMarketWalk()
    this.addSignalYard()
    this.addFlatKeeper(0, 2.2)
    this.addFlatClue('signal', 'Signal box', -7.2, -0.5, 'The brass plate reads: “Every last train returns in a LOOP.”')
    this.addFlatClue('mural', 'Market mural', 7.2, -1.7, 'A faded market mural shows the town under a gold SUNSET.')
    this.addFlatClue('bell', 'Hill bell', 0, -11.2, 'The hill bell rings once: the old sign needs the last word—LOOP.')
    this.addHillsideTraversalDetail()
    this.addBellRise()
    this.addReedwaterEdge()
    this.addReedwaterFord()
    this.addReedwaterFarBank()
    this.addReedwaterBoathouseRow()
    this.addRiverTradeLane()
    this.addBellOrchard()
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
    this.addReedwaterLanding(bridgeX)

    // The shore is physical except at the bridge and marked ford. This makes
    // Reedwater a shallow place that can be crossed deliberately, rather than
    // a decorative line at the end of the playable town.
    for (let x = -18; x <= 18; x += 2.35) {
      if (Math.abs(x - bridgeX) > 1.65 && Math.abs(x - 5.5) > 1.65) this.addStreetBlocker(x, -14.05, 1.03)
    }
    this.addStreetBlocker(bridgeX, -17.7, 0.7)
  }

  /** A marked stone ford makes the river a route, with a far-bank rest point. */
  private addReedwaterFord(): void {
    const fordX = 5.5
    const ford = this.createRollingStreetSurface(2.05, 3.7, fordX, -15.65, '#9d9a7b', 0.145)
    this.hillsideStreet.add(ford)
    const stone = new MeshLambertMaterial({ color: '#d2c89d', flatShading: true })
    for (let index = 0; index < 8; index += 1) {
      const z = -14.25 - index * 0.42
      const x = fordX + (index % 2 === 0 ? -0.24 : 0.22)
      const slab = new Mesh(new BoxGeometry(0.82, 0.09, 0.32), stone)
      slab.position.set(x, gentleStreetHeight(x, z) + 0.22, z)
      slab.rotation.y = index % 2 === 0 ? 0.08 : -0.1
      this.hillsideStreet.add(slab)
    }
    const farBank = this.createRollingStreetSurface(3.5, 1.15, fordX, -17.05, '#b9af77', 0.16)
    this.hillsideStreet.add(farBank)
    const railMaterial = new MeshLambertMaterial({ color: '#5a6860', flatShading: true })
    for (const xOffset of [-1.24, 1.24]) {
      const post = new Mesh(new CylinderGeometry(0.045, 0.06, 0.82, 5), railMaterial)
      post.position.set(fordX + xOffset, gentleStreetHeight(fordX + xOffset, -16.95) + 0.45, -16.95)
      this.hillsideStreet.add(post)
    }
    const sign = this.createSign('SHALLOW FORD', '#eef2dc', 175, 44)
    sign.scale.set(0.94, 0.25, 1)
    sign.position.set(fordX, gentleStreetHeight(fordX, -14.12) + 1.02, -14.12)
    this.hillsideStreet.add(sign)
  }

  /** A tiny far-bank row completes the river crossing with a real town destination. */
  private addReedwaterFarBank(): void {
    const bankZ = -16.72
    this.hillsideStreet.add(this.createRollingStreetSurface(12.8, 1.38, -0.35, bankZ, '#b8ad80', 0.16))
    const paver = new MeshLambertMaterial({ color: '#d1c39d', flatShading: true })
    for (let x = -6.1; x <= 5.5; x += 0.52) {
      const slab = new Mesh(new BoxGeometry(0.42, 0.045, 0.76), paver)
      slab.position.set(x, gentleStreetHeight(x, bankZ) + 0.23, bankZ)
      this.hillsideStreet.add(slab)
    }

    const ferryHouse = new Group()
    const brick = new MeshLambertMaterial({ color: '#a75b43', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#38545a', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#65463b', flatShading: true })
    const body = new Mesh(new BoxGeometry(2.32, 1.52, 1.56), brick)
    body.position.y = 0.76
    ferryHouse.add(body)
    const roof = new Mesh(new ConeGeometry(1.64, 0.7, 4), slate)
    roof.rotation.y = Math.PI / 4
    roof.position.y = 1.87
    ferryHouse.add(roof)
    const door = new Mesh(new PlaneGeometry(0.58, 0.96), new MeshLambertMaterial({ color: '#294e53', side: DoubleSide }))
    door.position.set(-0.36, 0.5, 0.79)
    ferryHouse.add(door)
    const window = new Mesh(new PlaneGeometry(0.46, 0.5), new MeshLambertMaterial({ color: '#dce8dc', side: DoubleSide }))
    window.position.set(0.52, 1.02, 0.79)
    ferryHouse.add(window)
    const houseSign = this.createSign('FERRY HOUSE', '#f5edcf', 165, 42)
    houseSign.scale.set(0.92, 0.23, 1)
    houseSign.position.set(0, 1.79, 0.8)
    ferryHouse.add(houseSign)
    ferryHouse.position.set(-2.2, gentleStreetHeight(-2.2, -16.78), -16.78)
    this.hillsideStreet.add(ferryHouse)
    this.addStreetBlocker(-2.2, -16.78, 1.33)

    const stall = new Group()
    const counter = new Mesh(new BoxGeometry(1.25, 0.62, 0.58), timber)
    counter.position.y = 0.31
    stall.add(counter)
    const canopy = new Mesh(new ConeGeometry(0.92, 0.42, 4), new MeshLambertMaterial({ color: '#d0a156', flatShading: true }))
    canopy.rotation.y = Math.PI / 4
    canopy.position.y = 1.08
    stall.add(canopy)
    const basket = new Mesh(new CylinderGeometry(0.15, 0.18, 0.16, 6), new MeshLambertMaterial({ color: '#c67c45', flatShading: true }))
    basket.position.set(0.22, 0.72, 0.06)
    stall.add(basket)
    stall.position.set(2.65, gentleStreetHeight(2.65, -16.6), -16.6)
    this.hillsideStreet.add(stall)
    this.addStreetBlocker(2.65, -16.6, 0.78)

    for (const x of [-5.5, 4.85]) {
      const lamp = new Group()
      const post = new Mesh(new CylinderGeometry(0.06, 0.08, 1.45, 6), new MeshLambertMaterial({ color: '#40585a', flatShading: true }))
      post.position.y = 0.72
      lamp.add(post)
      const glow = new Mesh(new SphereGeometry(0.12, 7, 5), new MeshLambertMaterial({ color: '#f5ce67', emissive: new Color('#bf7d34'), emissiveIntensity: 0.65, flatShading: true }))
      glow.position.y = 1.45
      lamp.add(glow)
      lamp.position.set(x, gentleStreetHeight(x, bankZ), bankZ)
      this.hillsideStreet.add(lamp)
      this.addStreetBlocker(x, bankZ, 0.18)
    }
    const sign = this.createSign('REEDWATER FAR BANK', '#eef2dc', 235, 46)
    sign.scale.set(1.22, 0.27, 1)
    sign.position.set(0.6, gentleStreetHeight(0.6, -17.42) + 1.06, -17.42)
    this.hillsideStreet.add(sign)
  }

  /** A second far-bank frontage gives the river crossing a small neighbourhood, not a single prop. */
  private addReedwaterBoathouseRow(): void {
    const rowZ = -16.82
    this.hillsideStreet.add(this.createRollingStreetSurface(6.0, 1.42, -8.65, rowZ, '#b8ad80', 0.16))
    const timber = new MeshLambertMaterial({ color: '#65473a', flatShading: true })
    const brick = new MeshLambertMaterial({ color: '#b5684c', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#355258', flatShading: true })
    const cream = new MeshLambertMaterial({ color: '#dde3d3', side: DoubleSide })

    const boathouse = new Group()
    const body = new Mesh(new BoxGeometry(1.86, 1.42, 1.46), brick)
    body.position.y = 0.71
    boathouse.add(body)
    const roof = new Mesh(new ConeGeometry(1.32, 0.68, 4), slate)
    roof.rotation.y = Math.PI / 4
    roof.position.y = 1.75
    boathouse.add(roof)
    const doubleDoor = new Mesh(new PlaneGeometry(0.9, 0.88), new MeshLambertMaterial({ color: '#2d5557', side: DoubleSide }))
    doubleDoor.position.set(0.18, 0.48, 0.74)
    boathouse.add(doubleDoor)
    const window = new Mesh(new PlaneGeometry(0.38, 0.42), cream)
    window.position.set(-0.54, 0.95, 0.745)
    boathouse.add(window)
    const sign = this.createSign('BOAT HOUSE', '#f5edcf', 160, 42)
    sign.scale.set(0.9, 0.23, 1)
    sign.position.set(0, 1.7, 0.75)
    boathouse.add(sign)
    boathouse.position.set(-9.45, gentleStreetHeight(-9.45, rowZ), rowZ)
    this.hillsideStreet.add(boathouse)
    this.addStreetBlocker(-9.45, rowZ, 1.12)

    const netRack = new Group()
    for (const xOffset of [-0.44, 0.44]) {
      const post = new Mesh(new BoxGeometry(0.08, 1.1, 0.08), timber)
      post.position.set(xOffset, 0.55, 0)
      netRack.add(post)
    }
    const beam = new Mesh(new BoxGeometry(1.02, 0.08, 0.08), timber)
    beam.position.set(0, 0.98, 0)
    netRack.add(beam)
    for (const xOffset of [-0.22, 0.22]) {
      const net = new Mesh(new PlaneGeometry(0.32, 0.52), new MeshLambertMaterial({ color: '#7ea49b', transparent: true, opacity: 0.78, side: DoubleSide }))
      net.position.set(xOffset, 0.57, 0.05)
      netRack.add(net)
    }
    netRack.position.set(-6.75, gentleStreetHeight(-6.75, -16.72), -16.72)
    this.hillsideStreet.add(netRack)
    this.addStreetBlocker(-6.75, -16.72, 0.62)

    const boat = new Mesh(new BoxGeometry(0.86, 0.2, 1.55), new MeshLambertMaterial({ color: '#d18550', flatShading: true }))
    boat.position.set(-11.15, gentleStreetHeight(-11.15, -16.02) + 0.24, -16.02)
    boat.rotation.y = -0.35
    this.hillsideStreet.add(boat)
    this.addStreetBlocker(-11.15, -16.02, 0.68)
    const rowSign = this.createSign('REEDWATER ROW', '#eef1d8', 200, 46)
    rowSign.scale.set(1.08, 0.26, 1)
    rowSign.position.set(-8.25, gentleStreetHeight(-8.25, -15.92) + 1.06, -15.92)
    this.hillsideStreet.add(rowSign)
  }

  /** Turns the old bridge's view point into a small usable landing by the reeds. */
  private addReedwaterLanding(bridgeX: number): void {
    const timber = new MeshLambertMaterial({ color: '#765440', flatShading: true })
    const darkTimber = new MeshLambertMaterial({ color: '#503f38', flatShading: true })
    const deckZ = -14.38
    this.hillsideStreet.add(this.createRollingStreetSurface(2.7, 1.72, bridgeX, deckZ, '#846246', 0.22))
    for (let index = 0; index < 5; index += 1) {
      const plank = new Mesh(new BoxGeometry(2.82, 0.07, 0.22), timber)
      const z = deckZ - 0.62 + index * 0.31
      plank.position.set(bridgeX, gentleStreetHeight(bridgeX, z) + 0.3, z)
      this.hillsideStreet.add(plank)
    }
    const shelter = new Group()
    for (const xOffset of [-0.58, 0.58]) {
      const post = new Mesh(new BoxGeometry(0.1, 1.35, 0.1), darkTimber)
      post.position.set(xOffset, 0.68, 0)
      shelter.add(post)
    }
    const roof = new Mesh(new ConeGeometry(1.1, 0.48, 4), new MeshLambertMaterial({ color: '#40585a', flatShading: true }))
    roof.rotation.y = Math.PI / 4
    roof.position.y = 1.52
    shelter.add(roof)
    const bench = new Mesh(new BoxGeometry(1.15, 0.14, 0.34), timber)
    bench.position.set(0, 0.43, -0.16)
    shelter.add(bench)
    shelter.position.set(bridgeX + 0.62, gentleStreetHeight(bridgeX + 0.62, deckZ), deckZ)
    this.hillsideStreet.add(shelter)
    this.addStreetBlocker(bridgeX + 0.62, deckZ, 0.74)

    const skiff = new Group()
    const hull = new Mesh(new BoxGeometry(0.72, 0.22, 1.75), new MeshLambertMaterial({ color: '#b8754b', flatShading: true }))
    hull.position.y = 0.1
    skiff.add(hull)
    const oar = new Mesh(new BoxGeometry(1.35, 0.04, 0.06), darkTimber)
    oar.position.set(0.2, 0.27, 0)
    oar.rotation.y = 0.52
    skiff.add(oar)
    skiff.position.set(bridgeX - 1.4, gentleStreetHeight(bridgeX - 1.4, -15.0) + 0.17, -15.0)
    this.hillsideStreet.add(skiff)
    this.addStreetBlocker(bridgeX - 1.4, -15.0, 0.64)

    for (const xOffset of [-1.18, -0.2]) {
      const post = new Mesh(new CylinderGeometry(0.08, 0.11, 1.02, 5), darkTimber)
      post.position.set(bridgeX + xOffset, gentleStreetHeight(bridgeX + xOffset, -15.05) + 0.51, -15.05)
      this.hillsideStreet.add(post)
      this.addStreetBlocker(bridgeX + xOffset, -15.05, 0.2)
    }
    const landingSign = this.createSign('REEDWATER LANDING', '#eef1d8', 250, 48)
    landingSign.scale.set(1.28, 0.28, 1)
    landingSign.position.set(bridgeX, gentleStreetHeight(bridgeX, -13.98) + 1.26, -13.98)
    this.hillsideStreet.add(landingSign)
  }

  /** A continuous trade lane turns the southern river edge into part of Ravnbro's town fabric. */
  private addRiverTradeLane(): void {
    const lane = this.createRollingStreetSurface(3.05, 6.9, -6.25, -10.35, '#c8b68c', 0.11)
    this.hillsideStreet.add(lane)
    const stone = new MeshLambertMaterial({ color: '#a99370', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#765440', flatShading: true })
    const darkTimber = new MeshLambertMaterial({ color: '#4f4139', flatShading: true })
    const canvas = new MeshLambertMaterial({ color: '#d7cfb0', flatShading: true })
    for (let z = -7.45; z >= -13.1; z -= 0.45) {
      const cobble = new Mesh(new BoxGeometry(2.72, 0.055, 0.29), stone)
      cobble.position.set(-6.25, gentleStreetHeight(-6.25, z) + 0.16, z)
      this.hillsideStreet.add(cobble)
    }

    const goodsHoist = new Group()
    for (const xOffset of [-0.52, 0.52]) {
      const post = new Mesh(new BoxGeometry(0.12, 1.48, 0.12), darkTimber)
      post.position.set(xOffset, 0.74, 0)
      goodsHoist.add(post)
    }
    const beam = new Mesh(new BoxGeometry(1.28, 0.14, 0.14), darkTimber)
    beam.position.set(0, 1.36, 0)
    goodsHoist.add(beam)
    const rope = new Mesh(new CylinderGeometry(0.025, 0.025, 0.68, 5), new MeshLambertMaterial({ color: '#c6b184', flatShading: true }))
    rope.position.set(0.26, 0.99, 0.05)
    goodsHoist.add(rope)
    const hook = new Mesh(new TorusGeometry(0.12, 0.03, 5, 8, Math.PI), new MeshLambertMaterial({ color: '#45595c', flatShading: true }))
    hook.rotation.z = Math.PI
    hook.position.set(0.26, 0.6, 0.05)
    goodsHoist.add(hook)
    goodsHoist.position.set(-7.85, gentleStreetHeight(-7.85, -10.1), -10.1)
    this.hillsideStreet.add(goodsHoist)
    this.addStreetBlocker(-7.85, -10.1, 0.82)

    const stall = new Group()
    const counter = new Mesh(new BoxGeometry(1.24, 0.66, 0.62), timber)
    counter.position.y = 0.33
    stall.add(counter)
    const canopy = new Mesh(new ConeGeometry(0.94, 0.46, 4), canvas)
    canopy.rotation.y = Math.PI / 4
    canopy.position.y = 1.12
    stall.add(canopy)
    for (const xOffset of [-0.28, 0.28]) {
      const basket = new Mesh(new CylinderGeometry(0.13, 0.16, 0.14, 6), new MeshLambertMaterial({ color: '#d18b4c', flatShading: true }))
      basket.position.set(xOffset, 0.73, 0.05)
      stall.add(basket)
    }
    stall.position.set(-4.55, gentleStreetHeight(-4.55, -11.2), -11.2)
    this.hillsideStreet.add(stall)
    this.addStreetBlocker(-4.55, -11.2, 0.82)

    for (const z of [-8.25, -10.2, -12.2]) {
      const bollard = new Mesh(new CylinderGeometry(0.09, 0.12, 0.7, 6), darkTimber)
      bollard.position.set(-7.72, gentleStreetHeight(-7.72, z) + 0.35, z)
      this.hillsideStreet.add(bollard)
      this.addStreetBlocker(-7.72, z, 0.18)
    }
    const laneSign = this.createSign('RIVER TRADE LANE', '#eef0d7', 250, 48)
    laneSign.scale.set(1.22, 0.28, 1)
    laneSign.position.set(-5.65, gentleStreetHeight(-5.65, -8.0) + 1.18, -8.0)
    this.hillsideStreet.add(laneSign)
  }

  /** Bell Orchard is Ravnbro's public green between the station town and river routes. */
  private addBellOrchard(): void {
    const orchardX = 9.4
    const orchardZ = -7.35
    this.hillsideStreet.add(this.createRollingStreetSurface(5.7, 3.65, orchardX, orchardZ, '#719b5f', 0.1))
    this.hillsideStreet.add(this.createRollingStreetSurface(1.18, 4.35, 7.2, -8.55, '#d8d2b2', 0.13))
    const trunk = new MeshLambertMaterial({ color: '#694d3c', flatShading: true })
    const leafColors = ['#3d7d53', '#4e9361', '#5b8955']
    for (const [index, x, z] of [[0, 8.55, -6.6], [1, 10.45, -7.1], [2, 9.0, -8.8], [0, 11.5, -8.45]] as Array<[number, number, number]>) {
      const tree = new Group()
      const stem = new Mesh(new CylinderGeometry(0.1, 0.15, 1.22, 5), trunk)
      stem.position.y = 0.61
      tree.add(stem)
      const crown = new Mesh(new SphereGeometry(0.68, 7, 5), new MeshLambertMaterial({ color: leafColors[index], flatShading: true }))
      crown.scale.set(1, 0.82, 0.9)
      crown.position.y = 1.42
      tree.add(crown)
      tree.position.set(x, gentleStreetHeight(x, z), z)
      this.hillsideStreet.add(tree)
      this.addStreetBlocker(x, z, 0.5)
    }
    const benchMaterial = new MeshLambertMaterial({ color: '#765440', flatShading: true })
    const bench = new Mesh(new BoxGeometry(1.46, 0.14, 0.38), benchMaterial)
    bench.position.set(11.25, gentleStreetHeight(11.25, -6.15) + 0.42, -6.15)
    this.hillsideStreet.add(bench)
    const benchBack = new Mesh(new BoxGeometry(1.46, 0.29, 0.08), benchMaterial)
    benchBack.position.set(11.25, gentleStreetHeight(11.25, -6.15) + 0.61, -6.0)
    this.hillsideStreet.add(benchBack)
    const fountain = new Mesh(new CylinderGeometry(0.54, 0.68, 0.28, 8), new MeshLambertMaterial({ color: '#a7b5aa', flatShading: true }))
    fountain.position.set(7.85, gentleStreetHeight(7.85, -7.6) + 0.14, -7.6)
    this.hillsideStreet.add(fountain)
    const water = new Mesh(new CylinderGeometry(0.36, 0.36, 0.035, 8), new MeshLambertMaterial({ color: '#70b6b2', emissive: new Color('#4b8d91'), emissiveIntensity: 0.12, flatShading: true }))
    water.position.set(7.85, gentleStreetHeight(7.85, -7.6) + 0.3, -7.6)
    this.hillsideStreet.add(water)
    this.addStreetBlocker(7.85, -7.6, 0.48)
    const sign = this.createSign('BELL ORCHARD', '#f4ecd5', 200, 46)
    sign.scale.set(1.1, 0.27, 1)
    sign.position.set(9.45, gentleStreetHeight(9.45, -5.5) + 1.06, -5.5)
    this.hillsideStreet.add(sign)
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

  /** A small cobbled yard lets the market read as a sequence of lanes and thresholds. */
  private addMarketCourtyard(): void {
    const yardX = 12.2
    const yardZ = 0.15
    this.hillsideStreet.add(this.createRollingStreetSurface(4.65, 3.55, yardX, yardZ, '#cbb78f', 0.105))
    this.hillsideStreet.add(this.createRollingStreetSurface(3.8, 1.18, 9.9, 0.18, '#d8c9a7', 0.11))

    const timber = new MeshLambertMaterial({ color: '#65483b', flatShading: true })
    const paleBrick = new MeshLambertMaterial({ color: '#c68a68', flatShading: true })
    const deepBrick = new MeshLambertMaterial({ color: '#8b4b40', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#40595b', flatShading: true })
    const rearWing = new Mesh(new BoxGeometry(1.75, 1.56, 1.68), paleBrick)
    rearWing.position.set(13.62, gentleStreetHeight(13.62, -0.68) + 0.78, -0.68)
    this.hillsideStreet.add(rearWing)
    const rearRoof = new Mesh(new ConeGeometry(1.28, 0.68, 4), slate)
    rearRoof.rotation.y = Math.PI / 4
    rearRoof.position.set(13.62, gentleStreetHeight(13.62, -0.68) + 1.86, -0.68)
    this.hillsideStreet.add(rearRoof)
    for (const offsetZ of [-0.22, 0.32]) {
      const brickBand = new Mesh(new BoxGeometry(1.86, 0.08, 0.08), deepBrick)
      brickBand.position.set(13.62, gentleStreetHeight(13.62, -0.68) + 0.46 + (offsetZ + 0.22) * 1.35, -0.68 + offsetZ)
      this.hillsideStreet.add(brickBand)
    }

    const arch = new Group()
    for (const x of [-0.58, 0.58]) {
      const post = new Mesh(new BoxGeometry(0.12, 1.24, 0.12), timber)
      post.position.set(x, 0.62, 0)
      arch.add(post)
    }
    const lintel = new Mesh(new BoxGeometry(1.34, 0.16, 0.15), timber)
    lintel.position.set(0, 1.16, 0)
    arch.add(lintel)
    const lantern = new Mesh(new SphereGeometry(0.105, 7, 5), new MeshLambertMaterial({ color: '#f1cc68', emissive: new Color('#b87935'), emissiveIntensity: 0.68, flatShading: true }))
    lantern.position.set(0, 0.93, 0.13)
    arch.add(lantern)
    arch.position.set(10.82, gentleStreetHeight(10.82, 0.72), 0.72)
    this.hillsideStreet.add(arch)

    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 3; row += 1) {
        const tile = new Mesh(new BoxGeometry(0.48, 0.035, 0.38), new MeshLambertMaterial({ color: (column + row) % 2 === 0 ? '#b8aa89' : '#d5c7a2', flatShading: true }))
        const x = 11.05 + column * 0.58
        const z = 0.72 + row * 0.52
        tile.position.set(x, gentleStreetHeight(x, z) + 0.13, z)
        this.hillsideStreet.add(tile)
      }
    }
    const drain = new Mesh(new BoxGeometry(3.8, 0.05, 0.12), slate)
    drain.position.set(12.15, gentleStreetHeight(12.15, 1.52) + 0.15, 1.52)
    this.hillsideStreet.add(drain)
    for (const x of [11.15, 12.15, 13.15]) {
      const grate = new Mesh(new BoxGeometry(0.14, 0.035, 0.28), timber)
      grate.position.set(x, gentleStreetHeight(x, 1.52) + 0.18, 1.52)
      this.hillsideStreet.add(grate)
    }

    const barrel = new Mesh(new CylinderGeometry(0.23, 0.27, 0.64, 7), new MeshLambertMaterial({ color: '#765444', flatShading: true }))
    barrel.position.set(11.35, gentleStreetHeight(11.35, -1.16) + 0.32, -1.16)
    this.hillsideStreet.add(barrel)
    const flowerBox = new Mesh(new BoxGeometry(0.9, 0.34, 0.4), timber)
    flowerBox.position.set(12.18, gentleStreetHeight(12.18, -1.33) + 0.17, -1.33)
    this.hillsideStreet.add(flowerBox)
    for (const xOffset of [-0.28, 0, 0.28]) {
      const flower = new Mesh(new SphereGeometry(0.09, 6, 5), new MeshLambertMaterial({ color: xOffset === 0 ? '#e06e6a' : '#f0c65e', flatShading: true }))
      flower.position.set(12.18 + xOffset, gentleStreetHeight(12.18 + xOffset, -1.33) + 0.42, -1.33)
      this.hillsideStreet.add(flower)
    }
    const clothesline = new Mesh(new BoxGeometry(2.15, 0.035, 0.035), timber)
    clothesline.position.set(12.12, gentleStreetHeight(12.12, 1.08) + 1.52, 1.08)
    this.hillsideStreet.add(clothesline)
    for (const [x, color] of [[11.44, '#d7c462'], [12.12, '#5d91a0'], [12.8, '#c46e5c']] as Array<[number, string]>) {
      const cloth = new Mesh(new PlaneGeometry(0.36, 0.42), new MeshLambertMaterial({ color, side: DoubleSide }))
      cloth.position.set(x, gentleStreetHeight(x, 1.08) + 1.29, 1.11)
      this.hillsideStreet.add(cloth)
    }

    this.addStreetBlocker(13.62, -0.68, 1.1)
    this.addStreetBlocker(11.35, -1.16, 0.34)
    this.addStreetBlocker(12.18, -1.33, 0.55)
  }

  /**
   * A compact northern cut gives the Market Fold somewhere to lead. It uses
   * purpose-built cobbles, a clock repair workshop and a sheltered workbench
   * instead of treating the ground behind the market as unused lawn. The
   * centre remains deliberately open so this is a shortcut, not a prop maze.
   */
  private addRavnbroClockmakersCourt(): void {
    const laneX = 6.25
    const laneZ = 3.18
    this.hillsideStreet.add(this.createRollingStreetSurface(2.65, 5.35, laneX, laneZ, '#c7b58b', 0.105))
    this.hillsideStreet.add(this.createRollingStreetSurface(4.95, 2.48, 8.35, 5.45, '#c2af86', 0.11))

    const paleStone = new MeshLambertMaterial({ color: '#d8c8a2', flatShading: true })
    const warmStone = new MeshLambertMaterial({ color: '#ab966f', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#62463a', flatShading: true })
    const brick = new MeshLambertMaterial({ color: '#a35543', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#40575a', flatShading: true })
    const clockFace = new MeshLambertMaterial({ color: '#f1e6c8', flatShading: true })
    const iron = new MeshLambertMaterial({ color: '#3c5659', flatShading: true })

    for (let x = 5.12; x <= 7.38; x += 0.48) {
      for (let z = 0.95; z <= 5.3; z += 0.5) {
        const stone = new Mesh(new BoxGeometry(0.4, 0.038, 0.42), (Math.round((x + z) * 2) % 2 === 0) ? paleStone : warmStone)
        stone.position.set(x, gentleStreetHeight(x, z) + 0.14, z)
        this.hillsideStreet.add(stone)
      }
    }
    for (let x = 6.4; x <= 10.45; x += 0.5) {
      for (let z = 4.52; z <= 6.28; z += 0.48) {
        const stone = new Mesh(new BoxGeometry(0.42, 0.038, 0.38), (Math.round((x - z) * 2) % 2 === 0) ? warmStone : paleStone)
        stone.position.set(x, gentleStreetHeight(x, z) + 0.145, z)
        this.hillsideStreet.add(stone)
      }
    }

    const workshop = new Group()
    const workshopBody = new Mesh(new BoxGeometry(1.72, 1.58, 1.62), brick)
    workshopBody.position.y = 0.79
    workshop.add(workshopBody)
    const workshopRoof = new Mesh(new ConeGeometry(1.18, 0.65, 4), slate)
    workshopRoof.rotation.y = Math.PI / 4
    workshopRoof.position.y = 1.78
    workshop.add(workshopRoof)
    const workshopDoor = new Mesh(new PlaneGeometry(0.52, 0.9), new MeshLambertMaterial({ color: '#31565a', side: DoubleSide }))
    workshopDoor.position.set(-0.32, 0.48, 0.816)
    workshop.add(workshopDoor)
    const workshopWindow = new Mesh(new PlaneGeometry(0.44, 0.44), new MeshLambertMaterial({ color: '#dce6d9', side: DoubleSide }))
    workshopWindow.position.set(0.42, 0.96, 0.82)
    workshop.add(workshopWindow)
    const workshopSign = this.createSign('CLOCK REPAIR', '#f6edd5', 190, 46)
    workshopSign.scale.set(1.05, 0.28, 1)
    workshopSign.position.set(0, 1.8, 0.83)
    workshop.add(workshopSign)
    const clock = new Mesh(new CylinderGeometry(0.27, 0.27, 0.06, 12), clockFace)
    clock.rotation.x = Math.PI / 2
    clock.position.set(0, 1.34, 0.85)
    workshop.add(clock)
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const hand = new Mesh(new BoxGeometry(0.025, 0.12, 0.02), iron)
      hand.position.set(Math.sin(angle) * 0.15, 1.34 + Math.cos(angle) * 0.15, 0.89)
      workshop.add(hand)
    }
    workshop.position.set(9.92, gentleStreetHeight(9.92, 5.3), 5.3)
    this.hillsideStreet.add(workshop)
    this.addStreetBlocker(9.92, 5.3, 1.08)

    const workbench = new Group()
    const top = new Mesh(new BoxGeometry(1.18, 0.14, 0.54), timber)
    top.position.y = 0.72
    workbench.add(top)
    for (const xOffset of [-0.43, 0.43]) {
      const leg = new Mesh(new BoxGeometry(0.1, 0.72, 0.1), timber)
      leg.position.set(xOffset, 0.36, 0)
      workbench.add(leg)
    }
    const gear = new Mesh(new TorusGeometry(0.18, 0.045, 6, 10), new MeshLambertMaterial({ color: '#c7934d', flatShading: true }))
    gear.rotation.x = Math.PI / 2
    gear.position.set(-0.23, 0.83, 0.04)
    workbench.add(gear)
    const lamp = new Mesh(new SphereGeometry(0.11, 7, 5), new MeshLambertMaterial({ color: '#f2ce69', emissive: new Color('#bd8137'), emissiveIntensity: 0.68, flatShading: true }))
    lamp.position.set(0.34, 1.12, 0)
    workbench.add(lamp)
    workbench.position.set(8.02, gentleStreetHeight(8.02, 5.62), 5.62)
    this.hillsideStreet.add(workbench)
    this.addStreetBlocker(8.02, 5.62, 0.74)

    const cover = new Group()
    for (const xOffset of [-0.7, 0.7]) {
      const post = new Mesh(new BoxGeometry(0.1, 1.38, 0.1), timber)
      post.position.set(xOffset, 0.69, 0)
      cover.add(post)
    }
    const coverRoof = new Mesh(new BoxGeometry(1.78, 0.13, 0.86), new MeshLambertMaterial({ color: '#d1a356', flatShading: true }))
    coverRoof.position.y = 1.36
    cover.add(coverRoof)
    cover.position.set(5.1, gentleStreetHeight(5.1, 4.92), 4.92)
    this.hillsideStreet.add(cover)

    const drainage = new Mesh(new BoxGeometry(2.38, 0.045, 0.12), slate)
    drainage.position.set(6.28, gentleStreetHeight(6.28, 5.72) + 0.15, 5.72)
    this.hillsideStreet.add(drainage)
    for (const x of [5.48, 6.28, 7.08]) {
      const grate = new Mesh(new BoxGeometry(0.13, 0.03, 0.25), iron)
      grate.position.set(x, gentleStreetHeight(x, 5.72) + 0.18, 5.72)
      this.hillsideStreet.add(grate)
    }
    for (const [x, z] of [[7.22, 4.78], [10.45, 4.22], [10.7, 6.2]] as Array<[number, number]>) {
      const post = new Mesh(new CylinderGeometry(0.09, 0.12, 0.7, 6), iron)
      post.position.set(x, gentleStreetHeight(x, z) + 0.35, z)
      this.hillsideStreet.add(post)
      this.addStreetBlocker(x, z, 0.18)
    }
    const courtSign = this.createSign('CLOCKMAKERS\' COURT', '#eef0d9', 228, 48)
    courtSign.scale.set(1.25, 0.28, 1)
    courtSign.position.set(6.26, gentleStreetHeight(6.26, 5.84) + 1.22, 5.84)
    this.hillsideStreet.add(courtSign)
  }

  /**
   * A narrow craft lane joins the market's rear courtyard to the northern walk.
   * The workshop and forge stay to one side, so a phone-sized player view keeps
   * a clear line through the middle instead of gaining another prop maze.
   */
  private addRavnbroCoppersmithLane(): void {
    const laneX = 12.18
    const laneZ = 4.82
    this.hillsideStreet.add(this.createRollingStreetSurface(2.45, 6.55, laneX, laneZ, '#c5b38a', 0.108))

    const paleStone = new MeshLambertMaterial({ color: '#d9cba7', flatShading: true })
    const warmStone = new MeshLambertMaterial({ color: '#aa956f', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#65483b', flatShading: true })
    const brick = new MeshLambertMaterial({ color: '#9f5140', flatShading: true })
    const darkBrick = new MeshLambertMaterial({ color: '#713c35', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#3b5658', flatShading: true })
    const copper = new MeshLambertMaterial({ color: '#c47d43', emissive: new Color('#7a4a2f'), emissiveIntensity: 0.18, flatShading: true })

    for (let x = 11.17; x <= 13.18; x += 0.48) {
      for (let z = 1.9; z <= 7.92; z += 0.48) {
        const paver = new Mesh(new BoxGeometry(0.4, 0.038, 0.38), (Math.round((x + z) * 2) % 2 === 0) ? paleStone : warmStone)
        paver.position.set(x, gentleStreetHeight(x, z) + 0.148, z)
        this.hillsideStreet.add(paver)
      }
    }

    const workshopX = 14.62
    const workshopZ = 4.3
    const workshop = new Group()
    const workshopBody = new Mesh(new BoxGeometry(2.28, 1.7, 1.82), brick)
    workshopBody.position.y = 0.85
    workshop.add(workshopBody)
    const workshopRoof = new Mesh(new ConeGeometry(1.62, 0.74, 4), slate)
    workshopRoof.rotation.y = Math.PI / 4
    workshopRoof.position.y = 2.05
    workshop.add(workshopRoof)
    const workshopDoor = new Mesh(new PlaneGeometry(0.64, 0.96), new MeshLambertMaterial({ color: '#2d5054', side: DoubleSide }))
    workshopDoor.position.set(-0.42, 0.5, 0.92)
    workshop.add(workshopDoor)
    const workshopWindow = new Mesh(new PlaneGeometry(0.48, 0.54), new MeshLambertMaterial({ color: '#dbe6d8', side: DoubleSide }))
    workshopWindow.position.set(0.48, 1.02, 0.925)
    workshop.add(workshopWindow)
    const workshopSign = this.createSign('COPPERSMITH', '#f5ebd0', 205, 48)
    workshopSign.scale.set(1.12, 0.28, 1)
    workshopSign.position.set(0, 1.96, 0.93)
    workshop.add(workshopSign)
    const chimney = new Mesh(new BoxGeometry(0.28, 1.05, 0.28), darkBrick)
    chimney.position.set(0.64, 2.18, -0.36)
    workshop.add(chimney)
    workshop.position.set(workshopX, gentleStreetHeight(workshopX, workshopZ), workshopZ)
    this.hillsideStreet.add(workshop)
    this.addStreetBlocker(workshopX, workshopZ, 1.34)

    const forgeX = 14.1
    const forgeZ = 6.88
    const forge = new Group()
    const forgeBase = new Mesh(new BoxGeometry(0.82, 0.62, 0.68), darkBrick)
    forgeBase.position.y = 0.31
    forge.add(forgeBase)
    const forgeGlow = new Mesh(new CylinderGeometry(0.22, 0.26, 0.08, 7), copper)
    forgeGlow.position.set(0, 0.66, 0.03)
    forge.add(forgeGlow)
    const hood = new Mesh(new ConeGeometry(0.52, 0.48, 4), slate)
    hood.rotation.y = Math.PI / 4
    hood.position.y = 1.12
    forge.add(hood)
    forge.position.set(forgeX, gentleStreetHeight(forgeX, forgeZ), forgeZ)
    this.hillsideStreet.add(forge)
    this.addStreetBlocker(forgeX, forgeZ, 0.62)

    const anvil = new Group()
    const anvilBase = new Mesh(new CylinderGeometry(0.15, 0.19, 0.56, 6), timber)
    anvilBase.position.y = 0.28
    anvil.add(anvilBase)
    const anvilTop = new Mesh(new BoxGeometry(0.64, 0.12, 0.2), slate)
    anvilTop.position.y = 0.61
    anvil.add(anvilTop)
    const hammer = new Mesh(new BoxGeometry(0.08, 0.38, 0.06), timber)
    hammer.rotation.z = 0.72
    hammer.position.set(0.13, 0.82, 0)
    anvil.add(hammer)
    anvil.position.set(13.95, gentleStreetHeight(13.95, 2.34), 2.34)
    this.hillsideStreet.add(anvil)
    this.addStreetBlocker(13.95, 2.34, 0.42)

    const drain = new Mesh(new BoxGeometry(0.12, 0.045, 5.78), slate)
    drain.position.set(10.98, gentleStreetHeight(10.98, laneZ) + 0.15, laneZ)
    this.hillsideStreet.add(drain)
    for (const z of [2.7, 4.55, 6.4]) {
      const grate = new Mesh(new BoxGeometry(0.26, 0.032, 0.13), timber)
      grate.position.set(10.98, gentleStreetHeight(10.98, z) + 0.176, z)
      this.hillsideStreet.add(grate)
    }

    for (const z of [2.3, 5.3, 7.6]) {
      const post = new Mesh(new CylinderGeometry(0.065, 0.075, 1.14, 6), slate)
      post.position.set(13.55, gentleStreetHeight(13.55, z) + 0.57, z)
      this.hillsideStreet.add(post)
      const lantern = new Mesh(new SphereGeometry(0.1, 7, 5), new MeshLambertMaterial({ color: '#f2cf67', emissive: new Color('#b97936'), emissiveIntensity: 0.68, flatShading: true }))
      lantern.position.set(13.55, gentleStreetHeight(13.55, z) + 1.13, z)
      this.hillsideStreet.add(lantern)
    }

    const rack = new Group()
    const rackPost = new Mesh(new BoxGeometry(0.1, 1.05, 0.1), timber)
    rackPost.position.y = 0.525
    rack.add(rackPost)
    const rackBar = new Mesh(new BoxGeometry(0.86, 0.07, 0.07), timber)
    rackBar.position.set(0.24, 0.9, 0)
    rack.add(rackBar)
    for (const xOffset of [0.04, 0.33, 0.62]) {
      const pan = new Mesh(new TorusGeometry(0.11, 0.027, 5, 8), copper)
      pan.rotation.x = Math.PI / 2
      pan.position.set(xOffset, 0.66, 0.02)
      rack.add(pan)
    }
    rack.position.set(13.8, gentleStreetHeight(13.8, 7.92), 7.92)
    this.hillsideStreet.add(rack)
    this.addStreetBlocker(13.8, 7.92, 0.36)

    const laneSign = this.createSign('COPPERSMITH LANE', '#edf0d8', 230, 48)
    laneSign.scale.set(1.22, 0.28, 1)
    laneSign.position.set(12.18, gentleStreetHeight(12.18, 2.02) + 1.2, 2.02)
    this.hillsideStreet.add(laneSign)
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

  /** The town's main pedestrian route crosses the rails at one deliberate, safe point. */
  private addStationRailCrossing(): void {
    const crossingZ = -4.45
    const deck = this.createRollingStreetSurface(1.55, 1.86, 0, crossingZ, '#9a7958', 0.225)
    this.hillsideStreet.add(deck)
    const timber = new MeshLambertMaterial({ color: '#634a3a', flatShading: true })
    const iron = new MeshLambertMaterial({ color: '#405b5e', flatShading: true })
    const amber = new MeshLambertMaterial({ color: '#f4c75d', emissive: new Color('#b77930'), emissiveIntensity: 0.55, flatShading: true })
    for (let z = -5.15; z <= -3.75; z += 0.28) {
      const plank = new Mesh(new BoxGeometry(1.62, 0.06, 0.12), timber)
      plank.position.set(0, gentleStreetHeight(0, z) + 0.27, z)
      this.hillsideStreet.add(plank)
    }
    for (const x of [-1.12, 1.12]) {
      for (const z of [-3.56, -5.34]) {
        const post = new Mesh(new CylinderGeometry(0.065, 0.085, 1.06, 6), iron)
        post.position.set(x, gentleStreetHeight(x, z) + 0.53, z)
        this.hillsideStreet.add(post)
        const lamp = new Mesh(new SphereGeometry(0.105, 7, 5), amber)
        lamp.position.set(x, gentleStreetHeight(x, z) + 1.05, z)
        this.hillsideStreet.add(lamp)
        this.addStreetBlocker(x, z, 0.22)
      }
    }
    const crossingSign = this.createSign('CROSSING', '#f2ecd1', 138, 38)
    crossingSign.scale.set(0.75, 0.21, 1)
    crossingSign.position.set(0, gentleStreetHeight(0, -3.5) + 1.15, -3.5)
    this.hillsideStreet.add(crossingSign)

    // Keep the railway a physical boundary without making the town feel fenced
    // off: the gap above is the readable, walkable route to Bell Rise.
    for (let x = -4.4; x <= 4.4; x += 1.08) {
      if (Math.abs(x) > 1.2) this.addStreetBlocker(x, crossingZ, 0.48)
    }
  }

  /** A compact parked shunter makes the platform feel like an active railway, not a rail-shaped border. */
  private addStationShunter(): void {
    const shunterX = 3.16
    const shunterZ = -4.46
    const shunter = new Group()
    const charcoal = new MeshLambertMaterial({ color: '#2c4b50', flatShading: true })
    const railBlue = new MeshLambertMaterial({ color: '#3d7280', flatShading: true })
    const warmMetal = new MeshLambertMaterial({ color: '#c78545', flatShading: true })
    const windowMaterial = new MeshLambertMaterial({ color: '#d3e3db', side: DoubleSide })
    const chassis = new Mesh(new BoxGeometry(2.34, 0.22, 0.82), charcoal)
    chassis.position.y = 0.48
    shunter.add(chassis)
    const body = new Mesh(new BoxGeometry(1.34, 0.7, 0.74), railBlue)
    body.position.set(-0.36, 0.84, 0)
    shunter.add(body)
    const cabin = new Mesh(new BoxGeometry(0.72, 0.92, 0.74), warmMetal)
    cabin.position.set(0.72, 1.0, 0)
    shunter.add(cabin)
    const roof = new Mesh(new BoxGeometry(0.88, 0.12, 0.92), charcoal)
    roof.position.set(0.72, 1.51, 0)
    shunter.add(roof)
    for (const zOffset of [-0.376, 0.376]) {
      const cabinWindow = new Mesh(new PlaneGeometry(0.43, 0.45), windowMaterial)
      cabinWindow.rotation.y = Math.PI / 2
      cabinWindow.position.set(1.086, 1.1, zOffset)
      shunter.add(cabinWindow)
    }
    for (const xOffset of [-0.74, 0.74]) {
      for (const zOffset of [-0.46, 0.46]) {
        const wheel = new Mesh(new CylinderGeometry(0.18, 0.18, 0.1, 7), charcoal)
        wheel.rotation.x = Math.PI / 2
        wheel.position.set(xOffset, 0.28, zOffset)
        shunter.add(wheel)
      }
    }
    const lamp = new Mesh(new SphereGeometry(0.11, 7, 5), new MeshLambertMaterial({ color: '#ffe18a', emissive: new Color('#d6933f'), emissiveIntensity: 0.72, flatShading: true }))
    lamp.position.set(-1.19, 0.79, 0)
    shunter.add(lamp)
    const loopMark = this.createSign('03', '#f2ecd1', 54, 42)
    loopMark.scale.set(0.33, 0.26, 1)
    loopMark.position.set(-0.26, 0.92, 0.382)
    shunter.add(loopMark)
    shunter.position.set(shunterX, gentleStreetHeight(shunterX, shunterZ), shunterZ)
    this.hillsideStreet.add(shunter)

    const cargo = new Mesh(new BoxGeometry(0.62, 0.42, 0.5), new MeshLambertMaterial({ color: '#a96d43', flatShading: true }))
    cargo.position.set(4.7, gentleStreetHeight(4.7, -5.25) + 0.21, -5.25)
    this.hillsideStreet.add(cargo)
    this.addStreetBlocker(shunterX, shunterZ, 1.3)
    this.addStreetBlocker(4.7, -5.25, 0.42)
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

  /**
   * A low-poly terrain shell reaches beyond the playable collision bounds.
   * It retains the district's own height function, so streets and props stay
   * aligned while the distant ground rolls away like a small globe.
   */
  private createStreetHorizon(width: number, length: number, heightAt: (x: number, z: number) => number, color: string): Mesh {
    const geometry = new PlaneGeometry(width, length, Math.max(24, Math.ceil(width / 4.8)), Math.max(22, Math.ceil(length / 4.8)))
    const positions = geometry.getAttribute('position')
    for (let index = 0; index < positions.count; index += 1) {
      positions.setZ(index, heightAt(positions.getX(index), -positions.getY(index)))
    }
    geometry.computeVertexNormals()
    geometry.rotateX(-Math.PI / 2)
    return new Mesh(geometry, new MeshLambertMaterial({ color, flatShading: true, side: DoubleSide }))
  }

  /**
   * A local section of the one global railway. It runs just beyond the dense
   * street pocket, making both directions of the loop visible without putting
   * rails through buildings or narrowing the player's normal walking routes.
   */
  private addStreetLoopSection(
    districtId: DistrictId,
    district: Group,
    heightAt: (x: number, z: number) => number,
    points: ReadonlyArray<readonly [number, number]>,
    exitLabel: string,
    signX: number,
    signZ: number,
  ): void {
    const createRoute = (offset: number) => points.map(([x, z], index) => {
      const previous = points[(index - 1 + points.length) % points.length]
      const next = points[(index + 1) % points.length]
      const directionX = next[0] - previous[0]
      const directionZ = next[1] - previous[1]
      const length = Math.hypot(directionX, directionZ) || 1
      const normalX = -directionZ / length
      const normalZ = directionX / length
      const railX = x + normalX * offset
      const railZ = z + normalZ * offset
      return new Vector3(railX, heightAt(railX, railZ) + 0.19, railZ)
    })
    const centre = new CatmullRomCurve3(createRoute(0), true, 'centripetal')
    const leftRail = new CatmullRomCurve3(createRoute(-0.28), true, 'centripetal')
    const rightRail = new CatmullRomCurve3(createRoute(0.28), true, 'centripetal')
    const ballast = new Mesh(new TubeGeometry(centre, 180, 0.38, 5, true), new MeshLambertMaterial({ color: '#8e856d', flatShading: true }))
    const iron = new MeshLambertMaterial({ color: '#365258', flatShading: true })
    district.add(ballast)
    district.add(new Mesh(new TubeGeometry(leftRail, 180, 0.055, 5, true), iron))
    district.add(new Mesh(new TubeGeometry(rightRail, 180, 0.055, 5, true), iron))

    const timber = new MeshLambertMaterial({ color: '#64493a', flatShading: true })
    for (let index = 0; index < 68; index += 1) {
      const progress = index / 68
      const point = centre.getPointAt(progress)
      const ahead = centre.getPointAt((progress + 0.002) % 1)
      const sleeper = new Mesh(new BoxGeometry(0.98, 0.075, 0.13), timber)
      sleeper.position.set(point.x, heightAt(point.x, point.z) + 0.14, point.z)
      sleeper.rotation.y = Math.atan2(ahead.z - point.z, ahead.x - point.x) + Math.PI / 2
      district.add(sleeper)
    }

    const exit = this.createSign(exitLabel, '#f4ecd5', 220, 48)
    exit.scale.set(1.18, 0.28, 1)
    exit.position.set(signX, heightAt(signX, signZ) + 1.16, signZ)
    district.add(exit)

    const stop = nextGlobalRailStop(districtId)
    const routeMark = this.createSign(`${stop.name} LOOP`, '#e7c76a', 150, 42)
    routeMark.scale.set(0.76, 0.22, 1)
    routeMark.position.set(signX, heightAt(signX, signZ) + 0.72, signZ)
    district.add(routeMark)
  }

  /** The station's outbound line visibly joins Ravnbro to the planet-wide loop. */
  private addRavnbroOutboundRail(): void {
    const route = new CatmullRomCurve3([
      new Vector3(4.45, gentleStreetHeight(4.45, -4.45) + 0.21, -4.45),
      new Vector3(5.15, gentleStreetHeight(5.15, -5.85) + 0.21, -5.85),
      new Vector3(6.05, gentleStreetHeight(6.05, -7.55) + 0.21, -7.55),
      new Vector3(7.25, gentleStreetHeight(7.25, -9.55) + 0.21, -9.55),
      new Vector3(8.8, gentleStreetHeight(8.8, -12.2) + 0.21, -12.2),
    ], false, 'centripetal')
    const ballast = new Mesh(new TubeGeometry(route, 56, 0.36, 5, false), new MeshLambertMaterial({ color: '#8e856d', flatShading: true }))
    this.hillsideStreet.add(ballast)
    const iron = new MeshLambertMaterial({ color: '#365258', flatShading: true })
    for (const offset of [-0.27, 0.27]) {
      const railPoints: Vector3[] = []
      for (let index = 0; index <= 28; index += 1) {
        const progress = index / 28
        const point = route.getPointAt(progress)
        const ahead = route.getPointAt(Math.min(1, progress + 0.01))
        const tangent = ahead.sub(point).normalize()
        railPoints.push(point.add(new Vector3(-tangent.z * offset, 0.03, tangent.x * offset)))
      }
      this.hillsideStreet.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(railPoints, false, 'centripetal'), 56, 0.055, 5, false), iron))
    }
    const timber = new MeshLambertMaterial({ color: '#64493a', flatShading: true })
    for (let index = 0; index < 24; index += 1) {
      const progress = index / 24
      const point = route.getPointAt(progress)
      const ahead = route.getPointAt(Math.min(1, progress + 0.01))
      const sleeper = new Mesh(new BoxGeometry(0.98, 0.075, 0.13), timber)
      sleeper.position.copy(point).add(new Vector3(0, -0.055, 0))
      sleeper.rotation.y = Math.atan2(ahead.z - point.z, ahead.x - point.x) + Math.PI / 2
      this.hillsideStreet.add(sleeper)
    }
    const sign = this.createSign('RAVNBRO OUTBOUND', '#f4ecd5', 210, 46)
    sign.scale.set(1.15, 0.28, 1)
    sign.position.set(6.95, gentleStreetHeight(6.95, -8.1) + 1.18, -8.1)
    this.hillsideStreet.add(sign)
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

  /** A visible public pavement finally joins Station Gate to North Yard and the north market. */
  private addRavnbroParcelLane(): void {
    const paleStone = new MeshLambertMaterial({ color: '#d8caa5', flatShading: true })
    const warmStone = new MeshLambertMaterial({ color: '#aa956f', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#68483b', flatShading: true })
    const iron = new MeshLambertMaterial({ color: '#3e595c', flatShading: true })

    this.hillsideStreet.add(this.createRollingStreetSurface(5.6, 1.38, -2.72, 2.12, '#c6b58d', 0.102))
    this.hillsideStreet.add(this.createRollingStreetSurface(1.38, 2.58, -5.1, 6.08, '#c6b58d', 0.104))
    for (let x = -5.15; x <= -0.38; x += 0.48) {
      for (let z = 1.62; z <= 2.62; z += 0.42) {
        const paver = new Mesh(new BoxGeometry(0.4, 0.036, 0.32), (Math.round((x + z) * 2) % 2 === 0) ? paleStone : warmStone)
        paver.position.set(x, gentleStreetHeight(x, z) + 0.145, z)
        this.hillsideStreet.add(paver)
      }
    }
    for (let z = 5.0; z <= 7.1; z += 0.42) {
      const paver = new Mesh(new BoxGeometry(0.4, 0.036, 0.32), (Math.round(z * 2) % 2 === 0) ? warmStone : paleStone)
      paver.position.set(-5.1, gentleStreetHeight(-5.1, z) + 0.147, z)
      this.hillsideStreet.add(paver)
    }

    const postGate = new Group()
    for (const xOffset of [-0.64, 0.64]) {
      const post = new Mesh(new BoxGeometry(0.1, 1.22, 0.1), timber)
      post.position.set(xOffset, 0.61, 0)
      postGate.add(post)
    }
    const lintel = new Mesh(new BoxGeometry(1.5, 0.14, 0.13), timber)
    lintel.position.y = 1.16
    postGate.add(lintel)
    const lamp = new Mesh(new SphereGeometry(0.1, 7, 5), new MeshLambertMaterial({ color: '#f5cf67', emissive: new Color('#bd7f36'), emissiveIntensity: 0.66, flatShading: true }))
    lamp.position.set(0, 0.96, 0.08)
    postGate.add(lamp)
    postGate.position.set(-4.35, gentleStreetHeight(-4.35, 2.12), 2.12)
    this.hillsideStreet.add(postGate)

    for (const [x, z] of [[-1.05, 2.82], [-4.55, 3.28], [-5.82, 6.2]] as Array<[number, number]>) {
      const post = new Mesh(new CylinderGeometry(0.06, 0.08, 1.16, 6), iron)
      post.position.set(x, gentleStreetHeight(x, z) + 0.58, z)
      this.hillsideStreet.add(post)
      const glow = new Mesh(new SphereGeometry(0.1, 7, 5), new MeshLambertMaterial({ color: '#f3cf69', emissive: new Color('#bc7b35'), emissiveIntensity: 0.62, flatShading: true }))
      glow.position.set(x, gentleStreetHeight(x, z) + 1.16, z)
      this.hillsideStreet.add(glow)
      this.addStreetBlocker(x, z, 0.16)
    }
    const parcelSign = this.createSign('PARCEL LANE', '#eef1d8', 185, 44)
    parcelSign.scale.set(1.0, 0.25, 1)
    parcelSign.position.set(-2.9, gentleStreetHeight(-2.9, 1.48) + 1.06, 1.48)
    this.hillsideStreet.add(parcelSign)
  }

  /**
   * A north-yard pocket extends the depot's small service lane into a proper
   * town edge. It is intentionally open through the middle: cargo gives it a
   * sense of work without making the player's first route feel hemmed in.
   */
  private addRavnbroDepotYard(): void {
    const cobble = new MeshLambertMaterial({ color: '#b5aa89', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#68483b', flatShading: true })
    const brick = new MeshLambertMaterial({ color: '#9b5543', flatShading: true })
    const darkSlate = new MeshLambertMaterial({ color: '#3b5357', flatShading: true })
    const cream = new MeshLambertMaterial({ color: '#e4d9b8', flatShading: true })

    this.hillsideStreet.add(this.createRollingStreetSurface(5.4, 2.35, -8.2, 6.82, '#c9bea0', 0.09))
    this.hillsideStreet.add(this.createRollingStreetSurface(6.6, 4.15, -11.1, 8.25, '#b5aa89', 0.1))
    for (let x = -13.7; x <= -8.6; x += 0.56) {
      for (let z = 6.72; z <= 9.58; z += 0.52) {
        const stone = new Mesh(new BoxGeometry(0.46, 0.035, 0.4), (Math.round((x + z) * 2) % 2 === 0) ? cobble : cream)
        stone.position.set(x, gentleStreetHeight(x, z) + 0.15, z)
        this.hillsideStreet.add(stone)
      }
    }

    const shed = new Group()
    const shedBody = new Mesh(new BoxGeometry(2.62, 1.56, 1.92), brick)
    shedBody.position.y = 0.78
    shed.add(shedBody)
    const shedRoof = new Mesh(new ConeGeometry(1.76, 0.76, 4), darkSlate)
    shedRoof.rotation.y = Math.PI / 4
    shedRoof.position.y = 1.92
    shed.add(shedRoof)
    const doubleDoor = new Mesh(new PlaneGeometry(1.12, 0.96), new MeshLambertMaterial({ color: '#2d4e54', side: DoubleSide }))
    doubleDoor.position.set(0.28, 0.53, 0.968)
    shed.add(doubleDoor)
    for (const x of [-0.72, -0.12, 0.48]) {
      const window = new Mesh(new PlaneGeometry(0.29, 0.38), new MeshLambertMaterial({ color: '#dce8dc', side: DoubleSide }))
      window.position.set(x, 1.12, 0.978)
      shed.add(window)
    }
    const shedSign = this.createSign('POST & GOODS', '#f6eed7', 210, 50)
    shedSign.scale.set(1.16, 0.3, 1)
    shedSign.position.set(-0.12, 1.98, 0.985)
    shed.add(shedSign)
    shed.position.set(-12.42, gentleStreetHeight(-12.42, 8.45), 8.45)
    this.hillsideStreet.add(shed)
    this.addStreetBlocker(-12.42, 8.45, 1.56)

    const canopy = new Group()
    for (const x of [-1.05, 1.05]) {
      const post = new Mesh(new BoxGeometry(0.12, 1.62, 0.12), timber)
      post.position.set(x, 0.81, 0)
      canopy.add(post)
    }
    const beam = new Mesh(new BoxGeometry(2.52, 0.15, 0.16), timber)
    beam.position.set(0, 1.49, 0)
    canopy.add(beam)
    const roof = new Mesh(new BoxGeometry(2.72, 0.12, 1.1), darkSlate)
    roof.position.set(0, 1.58, -0.06)
    canopy.add(roof)
    const hangingLamp = new Mesh(new SphereGeometry(0.11, 7, 5), new MeshLambertMaterial({ color: '#f4d779', emissive: new Color('#c78639'), emissiveIntensity: 0.72, flatShading: true }))
    hangingLamp.position.set(0, 1.3, 0.08)
    canopy.add(hangingLamp)
    canopy.position.set(-9.5, gentleStreetHeight(-9.5, 8.28), 8.28)
    this.hillsideStreet.add(canopy)
    this.addStreetBlocker(-9.5, 8.28, 0.7)

    const handCart = new Group()
    const cartBody = new Mesh(new BoxGeometry(1.1, 0.34, 0.68), timber)
    cartBody.position.y = 0.42
    handCart.add(cartBody)
    const handle = new Mesh(new BoxGeometry(0.12, 0.1, 1.18), timber)
    handle.position.set(0, 0.66, 0.74)
    handle.rotation.x = -0.32
    handCart.add(handle)
    for (const x of [-0.39, 0.39]) {
      const wheel = new Mesh(new CylinderGeometry(0.18, 0.18, 0.09, 7), darkSlate)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(x, 0.19, -0.25)
      handCart.add(wheel)
    }
    const parcel = new Mesh(new BoxGeometry(0.46, 0.38, 0.38), new MeshLambertMaterial({ color: '#ca934b', flatShading: true }))
    parcel.position.set(-0.16, 0.77, -0.04)
    handCart.add(parcel)
    handCart.position.set(-7.5, gentleStreetHeight(-7.5, 8.9), 8.9)
    handCart.rotation.y = -0.32
    this.hillsideStreet.add(handCart)
    this.addStreetBlocker(-7.5, 8.9, 0.72)

    for (const [x, z, color] of [[-10.75, 6.95, '#a67243'], [-10.25, 7.15, '#cf9c50'], [-8.3, 7.78, '#9d6744']] as Array<[number, number, string]>) {
      const crate = new Mesh(new BoxGeometry(0.48, 0.42, 0.46), new MeshLambertMaterial({ color, flatShading: true }))
      crate.position.set(x, gentleStreetHeight(x, z) + 0.21, z)
      this.hillsideStreet.add(crate)
      this.addStreetBlocker(x, z, 0.32)
    }
    for (const x of [-13.9, -12.8, -11.7]) {
      const bollard = new Mesh(new CylinderGeometry(0.09, 0.12, 0.62, 6), timber)
      bollard.position.set(x, gentleStreetHeight(x, 6.3) + 0.31, 6.3)
      this.hillsideStreet.add(bollard)
      this.addStreetBlocker(x, 6.3, 0.17)
    }
    const yardSign = this.createSign('NORTH YARD', '#eef0d7', 190, 46)
    yardSign.scale.set(1.06, 0.28, 1)
    yardSign.position.set(-9.25, gentleStreetHeight(-9.25, 6.0) + 1.14, 6.0)
    this.hillsideStreet.add(yardSign)
  }

  /**
   * A short northbound siding makes the depot a real part of the railway.
   * The rails are decorative ground hardware; only the wagon, scale and
   * buffers collide, preserving a generous crossing through the market walk.
   */
  private addRavnbroFreightSpur(): void {
    const spurX = -12.3
    const startZ = 0.85
    const endZ = 7.95
    const centerZ = (startZ + endZ) / 2
    const ballast = this.createRollingStreetSurface(2.08, endZ - startZ + 0.42, spurX, centerZ, '#94886d', 0.115)
    this.hillsideStreet.add(ballast)

    const iron = new MeshLambertMaterial({ color: '#3e5659', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#674a3a', flatShading: true })
    const paleWood = new MeshLambertMaterial({ color: '#a67d55', flatShading: true })
    const railLength = endZ - startZ + 0.16
    for (const xOffset of [-0.36, 0.36]) {
      const rail = new Mesh(new BoxGeometry(0.075, 0.075, railLength), iron)
      rail.position.set(spurX + xOffset, gentleStreetHeight(spurX + xOffset, centerZ) + 0.22, centerZ)
      this.hillsideStreet.add(rail)
    }
    for (let z = startZ; z <= endZ; z += 0.47) {
      const sleeper = new Mesh(new BoxGeometry(1.48, 0.075, 0.13), timber)
      sleeper.position.set(spurX, gentleStreetHeight(spurX, z) + 0.165, z)
      this.hillsideStreet.add(sleeper)
    }

    const crossingZ = 7.42
    for (let z = crossingZ - 0.3; z <= crossingZ + 0.3; z += 0.2) {
      const crossingPlank = new Mesh(new BoxGeometry(1.62, 0.07, 0.12), paleWood)
      crossingPlank.position.set(spurX, gentleStreetHeight(spurX, z) + 0.255, z)
      this.hillsideStreet.add(crossingPlank)
    }

    const wagon = new Group()
    const wagonFrame = new Mesh(new BoxGeometry(1.4, 0.22, 1.62), new MeshLambertMaterial({ color: '#7f5b43', flatShading: true }))
    wagonFrame.position.y = 0.56
    wagon.add(wagonFrame)
    const wagonBed = new Mesh(new BoxGeometry(1.18, 0.16, 1.34), paleWood)
    wagonBed.position.y = 0.76
    wagon.add(wagonBed)
    for (const zOffset of [-0.53, 0.53]) {
      for (const xOffset of [-0.52, 0.52]) {
        const wheel = new Mesh(new CylinderGeometry(0.17, 0.17, 0.08, 7), iron)
        wheel.rotation.z = Math.PI / 2
        wheel.position.set(xOffset, 0.28, zOffset)
        wagon.add(wheel)
      }
    }
    for (const [x, z, color] of [[-0.22, -0.18, '#b36f44'], [0.22, 0.14, '#d0a152'], [0.04, -0.02, '#8c6045']] as Array<[number, number, string]>) {
      const crate = new Mesh(new BoxGeometry(0.36, 0.34, 0.38), new MeshLambertMaterial({ color, flatShading: true }))
      crate.position.set(x, 1.01, z)
      wagon.add(crate)
    }
    wagon.position.set(spurX, gentleStreetHeight(spurX, 4.24), 4.24)
    this.hillsideStreet.add(wagon)
    this.addStreetBlocker(spurX, 4.24, 0.98)

    const scaleX = -10.76
    const scaleZ = 5.58
    const scale = new Group()
    const scaleBase = new Mesh(new BoxGeometry(1.1, 0.16, 1.0), new MeshLambertMaterial({ color: '#b8aa87', flatShading: true }))
    scaleBase.position.y = 0.08
    scale.add(scaleBase)
    const scalePost = new Mesh(new BoxGeometry(0.1, 1.18, 0.1), iron)
    scalePost.position.set(0.36, 0.59, -0.35)
    scale.add(scalePost)
    const scaleFace = new Mesh(new BoxGeometry(0.45, 0.35, 0.08), new MeshLambertMaterial({ color: '#e8dfbc', flatShading: true }))
    scaleFace.position.set(0.36, 1.04, -0.35)
    scale.add(scaleFace)
    const scaleNeedle = new Mesh(new BoxGeometry(0.025, 0.17, 0.025), new MeshLambertMaterial({ color: '#bc664d', flatShading: true }))
    scaleNeedle.position.set(0.36, 1.04, -0.405)
    scaleNeedle.rotation.z = 0.52
    scale.add(scaleNeedle)
    scale.position.set(scaleX, gentleStreetHeight(scaleX, scaleZ), scaleZ)
    this.hillsideStreet.add(scale)
    this.addStreetBlocker(scaleX, scaleZ, 0.68)

    const spurSign = this.createSign('FREIGHT LINE', '#edf0d8', 180, 44)
    spurSign.scale.set(1.0, 0.25, 1)
    spurSign.position.set(-10.92, gentleStreetHeight(-10.92, 2.72) + 1.1, 2.72)
    this.hillsideStreet.add(spurSign)
  }

  /** The former dead-end freight spur now turns north and joins the through-line. */
  private addRavnbroNorthYardLoopLink(): void {
    const route = new CatmullRomCurve3([
      new Vector3(-12.3, gentleStreetHeight(-12.3, 7.75) + 0.22, 7.75),
      new Vector3(-12.72, gentleStreetHeight(-12.72, 8.26) + 0.22, 8.26),
      new Vector3(-13.42, gentleStreetHeight(-13.42, 8.62) + 0.22, 8.62),
      new Vector3(-14.5, gentleStreetHeight(-14.5, 8.4) + 0.22, 8.4),
    ], false, 'centripetal')
    this.hillsideStreet.add(new Mesh(new TubeGeometry(route, 32, 0.37, 5, false), new MeshLambertMaterial({ color: '#8e856d', flatShading: true })))
    const iron = new MeshLambertMaterial({ color: '#365258', flatShading: true })
    for (const offset of [-0.27, 0.27]) {
      const railPoints: Vector3[] = []
      for (let index = 0; index <= 20; index += 1) {
        const progress = index / 20
        const point = route.getPointAt(progress)
        const ahead = route.getPointAt(Math.min(1, progress + 0.02))
        const tangent = ahead.sub(point).normalize()
        railPoints.push(point.add(new Vector3(-tangent.z * offset, 0.03, tangent.x * offset)))
      }
      this.hillsideStreet.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(railPoints, false, 'centripetal'), 32, 0.055, 5, false), iron))
    }
    const timber = new MeshLambertMaterial({ color: '#64493a', flatShading: true })
    for (let index = 0; index < 13; index += 1) {
      const progress = index / 13
      const point = route.getPointAt(progress)
      const ahead = route.getPointAt(Math.min(1, progress + 0.02))
      const sleeper = new Mesh(new BoxGeometry(0.98, 0.075, 0.13), timber)
      sleeper.position.copy(point).add(new Vector3(0, -0.055, 0))
      sleeper.rotation.y = Math.atan2(ahead.z - point.z, ahead.x - point.x) + Math.PI / 2
      this.hillsideStreet.add(sleeper)
    }
    const sign = this.createSign('NORTH YARD → LOOP', '#f4ecd5', 205, 44)
    sign.scale.set(1.08, 0.26, 1)
    sign.position.set(-13.55, gentleStreetHeight(-13.55, 9.65) + 1.12, 9.65)
    this.hillsideStreet.add(sign)
  }

  /**
   * A paved public walk joins the two previously separate northern pockets.
   * It leaves a broad, collision-free centre line so the town gains density
   * without becoming a maze on a small phone screen.
   */
  private addRavnbroNorthMarketWalk(): void {
    const walkZ = 7.42
    this.hillsideStreet.add(this.createRollingStreetSurface(15.4, 2.18, -0.15, walkZ, '#c8b78e', 0.105))

    const paleStone = new MeshLambertMaterial({ color: '#d8c9a6', flatShading: true })
    const warmStone = new MeshLambertMaterial({ color: '#aa956f', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#694a3b', flatShading: true })
    const brick = new MeshLambertMaterial({ color: '#a35645', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#3d575a', flatShading: true })
    const linen = new MeshLambertMaterial({ color: '#e7d6a5', flatShading: true })

    for (let x = -7.55; x <= 7.18; x += 0.52) {
      for (let z = 6.62; z <= 8.2; z += 0.48) {
        const paver = new Mesh(new BoxGeometry(0.43, 0.038, 0.38), (Math.round((x - z) * 2) % 2 === 0) ? paleStone : warmStone)
        paver.position.set(x, gentleStreetHeight(x, z) + 0.145, z)
        this.hillsideStreet.add(paver)
      }
    }

    const lanternShop = new Group()
    const shopBody = new Mesh(new BoxGeometry(2.28, 1.64, 1.72), brick)
    shopBody.position.y = 0.82
    lanternShop.add(shopBody)
    const shopRoof = new Mesh(new ConeGeometry(1.58, 0.72, 4), slate)
    shopRoof.rotation.y = Math.PI / 4
    shopRoof.position.y = 1.86
    lanternShop.add(shopRoof)
    const shopDoor = new Mesh(new PlaneGeometry(0.56, 0.92), new MeshLambertMaterial({ color: '#2e5358', side: DoubleSide }))
    shopDoor.position.set(-0.42, 0.49, 0.868)
    lanternShop.add(shopDoor)
    const shopWindow = new Mesh(new PlaneGeometry(0.54, 0.56), new MeshLambertMaterial({ color: '#dce9dc', side: DoubleSide }))
    shopWindow.position.set(0.48, 0.98, 0.873)
    lanternShop.add(shopWindow)
    const awning = new Mesh(new BoxGeometry(2.42, 0.13, 0.48), linen)
    awning.position.set(0, 1.26, 1.04)
    lanternShop.add(awning)
    const shopSign = this.createSign('LANTERN MAKER', '#f5edd2', 220, 48)
    shopSign.scale.set(1.18, 0.28, 1)
    shopSign.position.set(0, 1.83, 0.88)
    lanternShop.add(shopSign)
    for (const xOffset of [-0.7, 0, 0.7]) {
      const lantern = new Mesh(new SphereGeometry(0.105, 7, 5), new MeshLambertMaterial({ color: '#f4cc62', emissive: new Color('#bb7934'), emissiveIntensity: 0.66, flatShading: true }))
      lantern.position.set(xOffset, 1.38, 1.17)
      lanternShop.add(lantern)
    }
    lanternShop.position.set(4.92, gentleStreetHeight(4.92, 9.08), 9.08)
    this.hillsideStreet.add(lanternShop)
    this.addStreetBlocker(4.92, 9.08, 1.34)

    const pump = new Group()
    const pumpStone = new Mesh(new CylinderGeometry(0.34, 0.42, 0.72, 7), warmStone)
    pumpStone.position.y = 0.36
    pump.add(pumpStone)
    const pumpPipe = new Mesh(new CylinderGeometry(0.07, 0.07, 0.95, 6), slate)
    pumpPipe.position.set(0, 0.92, 0)
    pump.add(pumpPipe)
    const pumpArm = new Mesh(new BoxGeometry(0.78, 0.08, 0.08), slate)
    pumpArm.position.set(0.31, 1.19, 0)
    pumpArm.rotation.z = -0.18
    pump.add(pumpArm)
    const handle = new Mesh(new SphereGeometry(0.1, 6, 5), new MeshLambertMaterial({ color: '#c58246', flatShading: true }))
    handle.position.set(0.66, 1.12, 0)
    pump.add(handle)
    pump.position.set(-1.45, gentleStreetHeight(-1.45, 8.86), 8.86)
    this.hillsideStreet.add(pump)
    this.addStreetBlocker(-1.45, 8.86, 0.48)

    const coveredRack = new Group()
    for (const xOffset of [-0.66, 0.66]) {
      const post = new Mesh(new BoxGeometry(0.09, 1.24, 0.09), timber)
      post.position.set(xOffset, 0.62, 0)
      coveredRack.add(post)
    }
    const rackRoof = new Mesh(new BoxGeometry(1.72, 0.12, 0.92), linen)
    rackRoof.position.y = 1.28
    coveredRack.add(rackRoof)
    for (const xOffset of [-0.35, 0.08, 0.42]) {
      const parcel = new Mesh(new BoxGeometry(0.32, 0.3, 0.36), new MeshLambertMaterial({ color: xOffset === 0.08 ? '#c9804b' : '#8a5c42', flatShading: true }))
      parcel.position.set(xOffset, 0.25, 0.04)
      coveredRack.add(parcel)
    }
    coveredRack.position.set(-5.32, gentleStreetHeight(-5.32, 8.82), 8.82)
    this.hillsideStreet.add(coveredRack)
    this.addStreetBlocker(-5.32, 8.82, 0.85)

    for (const [x, z] of [[-7.52, 8.55], [0.92, 8.56], [7.52, 8.48]] as Array<[number, number]>) {
      const bollard = new Mesh(new CylinderGeometry(0.09, 0.12, 0.68, 6), timber)
      bollard.position.set(x, gentleStreetHeight(x, z) + 0.34, z)
      this.hillsideStreet.add(bollard)
      this.addStreetBlocker(x, z, 0.18)
    }
    const walkSign = this.createSign('NORTH MARKET WALK', '#edf0d8', 236, 48)
    walkSign.scale.set(1.22, 0.28, 1)
    walkSign.position.set(1.1, gentleStreetHeight(1.1, 6.4) + 1.18, 6.4)
    this.hillsideStreet.add(walkSign)
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
      this.addStreetBlocker(x, z, 0.68)
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
      this.addStreetBlocker(x, z, 0.78)
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

  /** Harbour motion stays deliberately small: gulls, ripples and no simulation state. */
  private createHarbourStreetLife(): void {
    for (let index = 0; index < 5; index += 1) {
      const gull = new Mesh(new ConeGeometry(0.09, 0.38, 3), new MeshLambertMaterial({ color: '#f4efd9', flatShading: true }))
      gull.rotation.x = Math.PI / 2
      gull.userData = { kind: 'harbour-gull', phase: index * 1.29 }
      this.harbourStreetLife.add(gull)
    }
    for (let index = 0; index < 4; index += 1) {
      const ripple = new Mesh(new TorusGeometry(0.22, 0.025, 4, 10), new MeshLambertMaterial({ color: '#8ac5c4', flatShading: true }))
      ripple.rotation.x = Math.PI / 2
      ripple.userData = { kind: 'harbour-ripple', phase: index * 1.71 }
      this.harbourStreetLife.add(ripple)
    }
    this.harbourStreet.add(this.harbourStreetLife)
  }

  /** Moonhill has a few visible, local night details rather than a persistent NPC simulation. */
  private createObservatoryStreetLife(): void {
    const glow = new MeshLambertMaterial({ color: '#f5d87a', emissive: new Color('#c69142'), emissiveIntensity: 0.72, flatShading: true })
    for (let index = 0; index < 7; index += 1) {
      const firefly = new Mesh(new SphereGeometry(0.06, 6, 5), glow)
      firefly.userData = { kind: 'moon-firefly', phase: index * 0.9 }
      this.observatoryStreetLife.add(firefly)
    }
    for (let index = 0; index < 3; index += 1) {
      const swift = new Mesh(new ConeGeometry(0.075, 0.32, 3), new MeshLambertMaterial({ color: '#313e57', flatShading: true }))
      swift.rotation.x = Math.PI / 2
      swift.userData = { kind: 'moon-swift', phase: index * 2.1 }
      this.observatoryStreetLife.add(swift)
    }
    this.observatoryStreet.add(this.observatoryStreetLife)
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

  /** Street-scale counterpart to the title globe: an upright dockyard with a shallow local roll. */
  private createHarbourStreetWorld(): void {
    this.harbourStreet.visible = false
    this.harbourStreet.add(this.createStreetHorizon(142, 130, harbourStreetHeight, '#708b7d'))
    // The sea runs under the outer terrain shell. The land slopes into it
    // beyond the authored dock, so it reads as a coast instead of a clipped
    // rectangular plane at the far edge of the district.
    const water = new Mesh(new PlaneGeometry(142, 94), new MeshLambertMaterial({ color: '#347f8b', flatShading: true, side: DoubleSide }))
    water.rotation.x = -Math.PI / 2
    water.position.set(0, -0.18, -50)
    this.harbourStreet.add(water)
    this.harbourStreet.add(this.createHarbourStreetSurface(5.4, 25, 0, -1.4, '#697f79', 0.09))
    this.harbourStreet.add(this.createHarbourStreetSurface(8.4, 1.35, 0, -9.2, '#9f835f', 0.15))
    const warehouse = new Mesh(new BoxGeometry(3.5, 2.05, 2.25), new MeshLambertMaterial({ color: '#ad624c', flatShading: true }))
    warehouse.position.set(-4.05, harbourStreetHeight(-4.05, -0.7) + 1.03, -0.7)
    this.harbourStreet.add(warehouse)
    const roof = new Mesh(new ConeGeometry(2.15, 0.9, 4), new MeshLambertMaterial({ color: '#294a51', flatShading: true }))
    roof.rotation.y = Math.PI / 4
    roof.position.set(-4.05, harbourStreetHeight(-4.05, -0.7) + 2.28, -0.7)
    this.harbourStreet.add(roof)
    const warehouseSign = this.createSign('HARBOUR WORKS', '#f4d46a', 260, 58)
    warehouseSign.scale.set(1.5, 0.34, 1)
    warehouseSign.position.set(-4.05, harbourStreetHeight(-4.05, -0.7) + 2.95, -0.7)
    this.harbourStreet.add(warehouseSign)
    const crane = new Group()
    const orange = new MeshLambertMaterial({ color: '#d57d4d', flatShading: true })
    const mast = new Mesh(new BoxGeometry(0.25, 4.1, 0.25), orange)
    mast.position.y = 2.05
    crane.add(mast)
    const arm = new Mesh(new BoxGeometry(3.4, 0.18, 0.18), orange)
    arm.position.set(-1.35, 3.82, 0)
    crane.add(arm)
    crane.position.set(4.35, harbourStreetHeight(4.35, -4.8), -4.8)
    this.harbourStreet.add(crane)
    const boat = new Mesh(new BoxGeometry(2.0, 0.46, 3.2), new MeshLambertMaterial({ color: '#e6ddc3', flatShading: true }))
    boat.position.set(-5.6, 0.05, -13.25)
    this.harbourStreet.add(boat)
    for (const [x, z] of [[-2.5, -8.8], [2.5, -8.8], [-2.5, -10.1], [2.5, -10.1]] as Array<[number, number]>) {
      const post = new Mesh(new CylinderGeometry(0.11, 0.15, 1.2, 5), new MeshLambertMaterial({ color: '#704f3d', flatShading: true }))
      post.position.set(x, harbourStreetHeight(x, z) + 0.6, z)
      this.harbourStreet.add(post)
    }
    this.addHarbourOuterPier()
    this.addHarbourTideyard()
    this.addHarbourRepairQuay()
    this.addHarbourRailShed()
    this.addHarbourRailLoopLink()
    this.addHarbourTidalBasinAndGardens()
    this.addStreetLoopSection('harbour', this.harbourStreet, harbourStreetHeight, [
      [-14.5, 8.2], [-15.2, 0.5], [-13, -7.6], [-7.4, -12.8], [0.4, -14.2], [8.8, -11.7], [14.1, -5.2], [15, 2.8], [12.3, 9.2], [5, 11.4], [-4.8, 11.6],
    ], 'TO TIDEWAY CAUSEWAY', 10.4, 9.0)
    this.addHarbourChandleryYard()
    this.addHarbourTidehouseRow()
    this.addHarbourTideClockLights()
    this.addHarbourDockKeeper(-0.9, -6.35)
    this.addHarbourStreetMarker('harbour-valve', 'Tide valve', 'first', -5.6, -3.5, 'A blue tide valve clicks free. The dock pump can hear the sea again.')
    this.addHarbourStreetMarker('harbour-pump', 'Wake clock', 'second', 1.55, -8.0, 'The tide clock turns once, then keeps time with the water. The harbour breathes again.')
    this.harbourStreetBlockers.push({ center: new Vector3(-4.05, 0, -0.7), radius: 2.05 }, { center: new Vector3(4.35, 0, -4.8), radius: 0.72 })
    for (let x = -16; x <= 16; x += 2.2) this.harbourStreetBlockers.push({ center: new Vector3(x, 0, -11.2), radius: 1.0 })
    this.createHarbourStreetLife()
    this.scene.add(this.harbourStreet)
    this.updateSideQuestMarkers()
  }

  /** A walkable outer pier makes the dockyard an actual waterfront route. */
  private addHarbourOuterPier(): void {
    const wood = new MeshLambertMaterial({ color: '#896247', flatShading: true })
    const iron = new MeshLambertMaterial({ color: '#36545a', flatShading: true })
    const paint = new MeshLambertMaterial({ color: '#e2c45e', flatShading: true })
    const pier = this.createHarbourStreetSurface(5.4, 2.45, 5.15, -8.55, '#9e7955', 0.17)
    this.harbourStreet.add(pier)
    for (let x = 2.8; x <= 7.5; x += 0.52) {
      const plank = new Mesh(new BoxGeometry(0.42, 0.065, 2.58), wood)
      plank.position.set(x, harbourStreetHeight(x, -8.55) + 0.24, -8.55)
      this.harbourStreet.add(plank)
    }
    for (const z of [-9.65, -7.45]) {
      for (const x of [2.8, 4.75, 6.7]) {
        const post = new Mesh(new CylinderGeometry(0.07, 0.1, 0.82, 5), iron)
        post.position.set(x, harbourStreetHeight(x, z) + 0.41, z)
        this.harbourStreet.add(post)
        if (x !== 4.75) this.addHarbourStreetBlocker(x, z, 0.2)
      }
      const rail = new Mesh(new BoxGeometry(4.1, 0.065, 0.065), iron)
      rail.position.set(4.75, harbourStreetHeight(4.75, z) + 0.71, z)
      this.harbourStreet.add(rail)
    }
    const beacon = new Group()
    const tower = new Mesh(new CylinderGeometry(0.34, 0.48, 2.15, 7), new MeshLambertMaterial({ color: '#e0d6bd', flatShading: true }))
    tower.position.y = 1.08
    beacon.add(tower)
    const band = new Mesh(new CylinderGeometry(0.5, 0.5, 0.24, 7), paint)
    band.position.y = 1.1
    beacon.add(band)
    const roof = new Mesh(new ConeGeometry(0.52, 0.48, 6), iron)
    roof.position.y = 2.36
    beacon.add(roof)
    const lamp = new Mesh(new SphereGeometry(0.16, 7, 5), new MeshLambertMaterial({ color: '#fff0a3', emissive: new Color('#d48d3f'), emissiveIntensity: 0.85, flatShading: true }))
    lamp.position.y = 2.09
    beacon.add(lamp)
    beacon.position.set(7.55, harbourStreetHeight(7.55, -8.55), -8.55)
    this.harbourStreet.add(beacon)
    this.addHarbourStreetBlocker(7.55, -8.55, 0.86)
    for (const [x, z] of [[3.55, -8.22], [4.25, -8.95], [5.05, -8.22]] as Array<[number, number]>) {
      const crate = new Mesh(new BoxGeometry(0.52, 0.46, 0.52), new MeshLambertMaterial({ color: '#b77646', flatShading: true }))
      crate.position.set(x, harbourStreetHeight(x, z) + 0.23, z)
      this.harbourStreet.add(crate)
      this.addHarbourStreetBlocker(x, z, 0.38)
    }
    const pierSign = this.createSign('OUTER PIER', '#f2ead0', 190, 48)
    pierSign.scale.set(1.06, 0.28, 1)
    pierSign.position.set(5.0, harbourStreetHeight(5.0, -7.38) + 1.22, -7.38)
    this.harbourStreet.add(pierSign)
  }

  /**
   * The tide clock's lamps begin as low, blue guide lights. Finishing the
   * dock story restores their sea-green glow along the water edge.
   */
  private addHarbourTideClockLights(): void {
    const iron = new MeshLambertMaterial({ color: '#36545a', flatShading: true })
    const brass = new MeshLambertMaterial({ color: '#c69b56', flatShading: true })
    for (const [x, z] of [[-1.45, -9.62], [0.55, -9.62], [2.55, -9.62]] as Array<[number, number]>) {
      const lamp = new Group()
      const base = new Mesh(new CylinderGeometry(0.16, 0.2, 0.14, 6), brass)
      base.position.y = 0.07
      lamp.add(base)
      const post = new Mesh(new CylinderGeometry(0.045, 0.065, 1.08, 6), iron)
      post.position.y = 0.58
      lamp.add(post)
      const light = new MeshLambertMaterial({ color: '#537787', emissive: new Color('#285664'), emissiveIntensity: 0.14, flatShading: true })
      this.harbourRestorationLights.push(light)
      const globe = new Mesh(new SphereGeometry(0.15, 7, 5), light)
      globe.position.y = 1.16
      lamp.add(globe)
      lamp.position.set(x, harbourStreetHeight(x, z), z)
      this.harbourStreet.add(lamp)
      this.addHarbourStreetBlocker(x, z, 0.22)
    }
    const clockPost = new Group()
    const frame = new Mesh(new BoxGeometry(0.66, 0.88, 0.16), iron)
    frame.position.y = 0.72
    clockPost.add(frame)
    const faceMaterial = new MeshLambertMaterial({ color: '#537787', emissive: new Color('#285664'), emissiveIntensity: 0.14, flatShading: true })
    this.harbourRestorationLights.push(faceMaterial)
    const face = new Mesh(new SphereGeometry(0.2, 8, 6), faceMaterial)
    face.position.set(0, 0.75, 0.1)
    clockPost.add(face)
    const cap = new Mesh(new ConeGeometry(0.45, 0.24, 6), brass)
    cap.position.y = 1.28
    clockPost.add(cap)
    clockPost.position.set(1.55, harbourStreetHeight(1.55, -9.35), -9.35)
    this.harbourStreet.add(clockPost)
    this.addHarbourStreetBlocker(1.55, -9.35, 0.42)
  }

  /** A paved side yard makes the first dock quest legible from the main route. */
  private addHarbourTideyard(): void {
    const stone = new MeshLambertMaterial({ color: '#9a876b', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#755542', flatShading: true })
    const iron = new MeshLambertMaterial({ color: '#35565e', flatShading: true })
    const paint = new MeshLambertMaterial({ color: '#c77646', flatShading: true })
    const yard = this.createHarbourStreetSurface(8.0, 2.7, -4.25, -3.55, '#a98d68', 0.14)
    this.harbourStreet.add(yard)
    for (let x = -7.9; x <= -0.7; x += 0.55) {
      const board = new Mesh(new BoxGeometry(0.43, 0.06, 2.42), stone)
      board.position.set(x, harbourStreetHeight(x, -3.55) + 0.19, -3.55)
      this.harbourStreet.add(board)
    }
    const shed = new Group()
    const body = new Mesh(new BoxGeometry(1.62, 1.32, 1.14), timber)
    body.position.y = 0.66
    shed.add(body)
    const roof = new Mesh(new ConeGeometry(1.08, 0.58, 4), new MeshLambertMaterial({ color: '#3c5559', flatShading: true }))
    roof.rotation.y = Math.PI / 4
    roof.position.y = 1.58
    shed.add(roof)
    const door = new Mesh(new PlaneGeometry(0.58, 0.82), new MeshLambertMaterial({ color: '#294b52', side: DoubleSide }))
    door.position.set(0, 0.45, 0.576)
    shed.add(door)
    shed.position.set(-7.2, harbourStreetHeight(-7.2, -3.55), -3.55)
    this.harbourStreet.add(shed)
    this.addHarbourStreetBlocker(-7.2, -3.55, 1.04)

    for (const [x, z] of [[-6.7, -4.62], [-4.1, -4.62], [-1.4, -4.62]] as Array<[number, number]>) {
      const post = new Mesh(new CylinderGeometry(0.09, 0.12, 0.84, 5), iron)
      post.position.set(x, harbourStreetHeight(x, z) + 0.42, z)
      this.harbourStreet.add(post)
      const rope = new Mesh(new BoxGeometry(2.5, 0.055, 0.055), iron)
      rope.position.set(x + 1.25, harbourStreetHeight(x + 1.25, z) + 0.68, z)
      this.harbourStreet.add(rope)
    }
    for (const [x, z] of [[-3.35, -2.68], [-2.8, -2.68], [-2.8, -3.12]] as Array<[number, number]>) {
      const crate = new Mesh(new BoxGeometry(0.42, 0.4, 0.42), paint)
      crate.position.set(x, harbourStreetHeight(x, z) + 0.2, z)
      this.harbourStreet.add(crate)
      this.addHarbourStreetBlocker(x, z, 0.32)
    }
    const sign = this.createSign('TIDE YARD', '#f2ead0', 180, 48)
    sign.scale.set(1.02, 0.27, 1)
    sign.position.set(-5.55, harbourStreetHeight(-5.55, -2.35) + 1.02, -2.35)
    this.harbourStreet.add(sign)
  }

  /**
   * The east repair quay gives Harbour Works a second physical waterfront
   * pocket. It keeps a wide approach from the main road while a hauled boat,
   * workshop and edge rail make the working harbour readable at street scale.
   */
  private addHarbourRepairQuay(): void {
    const plank = new MeshLambertMaterial({ color: '#967052', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#6c4c3b', flatShading: true })
    const iron = new MeshLambertMaterial({ color: '#34565d', flatShading: true })
    const brick = new MeshLambertMaterial({ color: '#b86750', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#304c54', flatShading: true })
    const cream = new MeshLambertMaterial({ color: '#e7dcc0', flatShading: true })

    this.harbourStreet.add(this.createHarbourStreetSurface(7.4, 2.65, 6.0, -4.55, '#a27d5b', 0.16))
    this.harbourStreet.add(this.createHarbourStreetSurface(4.1, 2.1, 9.9, -6.15, '#8d694f', 0.17))
    for (let x = 2.7; x <= 9.35; x += 0.5) {
      const board = new Mesh(new BoxGeometry(0.39, 0.065, 2.52), plank)
      board.position.set(x, harbourStreetHeight(x, -4.55) + 0.23, -4.55)
      this.harbourStreet.add(board)
    }
    for (let x = 8.1; x <= 11.6; x += 0.48) {
      const board = new Mesh(new BoxGeometry(0.42, 0.065, 1.92), plank)
      board.position.set(x, harbourStreetHeight(x, -6.15) + 0.24, -6.15)
      this.harbourStreet.add(board)
    }

    const workshop = new Group()
    const body = new Mesh(new BoxGeometry(2.5, 1.65, 1.85), brick)
    body.position.y = 0.82
    workshop.add(body)
    const roof = new Mesh(new ConeGeometry(1.65, 0.72, 4), slate)
    roof.rotation.y = Math.PI / 4
    roof.position.y = 2.0
    workshop.add(roof)
    const door = new Mesh(new PlaneGeometry(0.92, 1.06), new MeshLambertMaterial({ color: '#294c52', side: DoubleSide }))
    door.position.set(-0.25, 0.55, 0.931)
    workshop.add(door)
    const window = new Mesh(new PlaneGeometry(0.45, 0.46), new MeshLambertMaterial({ color: '#d8e6dc', side: DoubleSide }))
    window.position.set(0.78, 1.12, 0.94)
    workshop.add(window)
    const sign = this.createSign('REPAIR QUAY', '#f3ead2', 205, 48)
    sign.scale.set(1.14, 0.3, 1)
    sign.position.set(0, 2.02, 0.95)
    workshop.add(sign)
    workshop.position.set(10.65, harbourStreetHeight(10.65, -3.65), -3.65)
    this.harbourStreet.add(workshop)
    this.addHarbourStreetBlocker(10.65, -3.65, 1.5)

    const gantry = new Group()
    for (const x of [-1.05, 1.05]) {
      const post = new Mesh(new BoxGeometry(0.13, 2.45, 0.13), iron)
      post.position.set(x, 1.22, 0)
      gantry.add(post)
    }
    const beam = new Mesh(new BoxGeometry(2.38, 0.16, 0.16), iron)
    beam.position.set(0, 2.28, 0)
    gantry.add(beam)
    const chain = new Mesh(new CylinderGeometry(0.025, 0.025, 0.98, 5), new MeshLambertMaterial({ color: '#c0b48f', flatShading: true }))
    chain.position.set(-0.12, 1.7, 0.02)
    gantry.add(chain)
    const hook = new Mesh(new TorusGeometry(0.13, 0.032, 5, 8, Math.PI), iron)
    hook.rotation.z = Math.PI
    hook.position.set(-0.12, 1.2, 0.02)
    gantry.add(hook)
    gantry.position.set(6.1, harbourStreetHeight(6.1, -5.72), -5.72)
    this.harbourStreet.add(gantry)
    this.addHarbourStreetBlocker(5.05, -5.72, 0.22)
    this.addHarbourStreetBlocker(7.15, -5.72, 0.22)

    const boat = new Group()
    const hull = new Mesh(new BoxGeometry(2.28, 0.5, 0.92), cream)
    hull.position.y = 0.42
    boat.add(hull)
    const gunwale = new Mesh(new BoxGeometry(2.42, 0.11, 1.06), timber)
    gunwale.position.y = 0.7
    boat.add(gunwale)
    const cockpit = new Mesh(new BoxGeometry(0.78, 0.24, 0.64), slate)
    cockpit.position.set(0.22, 0.83, 0)
    boat.add(cockpit)
    const mast = new Mesh(new CylinderGeometry(0.045, 0.06, 1.45, 5), timber)
    mast.position.set(-0.5, 1.28, 0)
    boat.add(mast)
    const repairPatch = new Mesh(new PlaneGeometry(0.48, 0.38), new MeshLambertMaterial({ color: '#d38b4f', side: DoubleSide }))
    repairPatch.rotation.y = Math.PI / 2
    repairPatch.position.set(1.15, 0.52, 0)
    boat.add(repairPatch)
    boat.position.set(8.9, harbourStreetHeight(8.9, -6.18), -6.18)
    boat.rotation.y = -0.1
    this.harbourStreet.add(boat)
    this.addHarbourStreetBlocker(8.9, -6.18, 1.18)

    for (const [x, z] of [[3.0, -5.87], [4.5, -5.87], [7.6, -5.87], [10.0, -7.12], [11.5, -7.12]] as Array<[number, number]>) {
      const post = new Mesh(new CylinderGeometry(0.08, 0.11, 0.86, 5), iron)
      post.position.set(x, harbourStreetHeight(x, z) + 0.43, z)
      this.harbourStreet.add(post)
      this.addHarbourStreetBlocker(x, z, 0.18)
    }
    const edgeRail = new Mesh(new BoxGeometry(4.45, 0.06, 0.06), iron)
    edgeRail.position.set(5.25, harbourStreetHeight(5.25, -5.87) + 0.72, -5.87)
    this.harbourStreet.add(edgeRail)
    const quayRail = new Mesh(new BoxGeometry(2.0, 0.06, 0.06), iron)
    quayRail.position.set(10.75, harbourStreetHeight(10.75, -7.12) + 0.72, -7.12)
    this.harbourStreet.add(quayRail)

    for (const [x, z, color] of [[4.1, -3.72, '#c87847'], [4.65, -3.5, '#b36b43'], [7.85, -4.0, '#d09d50']] as Array<[number, number, string]>) {
      const crate = new Mesh(new BoxGeometry(0.46, 0.4, 0.44), new MeshLambertMaterial({ color, flatShading: true }))
      crate.position.set(x, harbourStreetHeight(x, z) + 0.2, z)
      this.harbourStreet.add(crate)
      this.addHarbourStreetBlocker(x, z, 0.33)
    }
    const lifebuoy = new Mesh(new TorusGeometry(0.2, 0.055, 7, 12), new MeshLambertMaterial({ color: '#e7d9be', flatShading: true }))
    lifebuoy.rotation.y = Math.PI / 2
    lifebuoy.position.set(9.35, harbourStreetHeight(9.35, -4.72) + 1.04, -4.72)
    this.harbourStreet.add(lifebuoy)
  }

  /**
   * The inland side of Harbour Works gets a short freight spur so the harbour
   * still feels connected to the loop. It is a compact, open loading pocket:
   * the shed and cart block properly, while the centre remains a clear route
   * from the player spawn toward the waterfront work yards.
   */
  private addHarbourRailShed(): void {
    const ballast = new MeshLambertMaterial({ color: '#9d9077', flatShading: true })
    const paleBallast = new MeshLambertMaterial({ color: '#c4b996', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#694b3b', flatShading: true })
    const iron = new MeshLambertMaterial({ color: '#344f56', flatShading: true })
    const brick = new MeshLambertMaterial({ color: '#a15b48', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#334e55', flatShading: true })

    this.harbourStreet.add(this.createHarbourStreetSurface(6.9, 3.9, 5.45, 6.3, '#a99879', 0.11))
    this.harbourStreet.add(this.createHarbourStreetSurface(3.85, 1.75, 2.7, 7.78, '#b6a682', 0.12))
    for (let x = 2.28; x <= 8.55; x += 0.52) {
      for (const z of [5.46, 6.54]) {
        const stone = new Mesh(new BoxGeometry(0.42, 0.04, 0.82), (Math.round(x * 2) % 2 === 0) ? ballast : paleBallast)
        stone.position.set(x, harbourStreetHeight(x, z) + 0.15, z)
        this.harbourStreet.add(stone)
      }
      const sleeper = new Mesh(new BoxGeometry(0.14, 0.065, 1.72), timber)
      sleeper.position.set(x, harbourStreetHeight(x, 6.0) + 0.2, 6.0)
      this.harbourStreet.add(sleeper)
    }
    for (const z of [5.46, 6.54]) {
      const rail = new Mesh(new BoxGeometry(6.7, 0.07, 0.075), iron)
      rail.position.set(5.42, harbourStreetHeight(5.42, z) + 0.25, z)
      this.harbourStreet.add(rail)
    }

    const shed = new Group()
    const body = new Mesh(new BoxGeometry(2.24, 1.62, 1.72), brick)
    body.position.y = 0.81
    shed.add(body)
    const roof = new Mesh(new ConeGeometry(1.52, 0.72, 4), slate)
    roof.rotation.y = Math.PI / 4
    roof.position.y = 1.98
    shed.add(roof)
    const door = new Mesh(new PlaneGeometry(0.94, 1.0), new MeshLambertMaterial({ color: '#294c52', side: DoubleSide }))
    door.position.set(-0.28, 0.53, 0.865)
    shed.add(door)
    const window = new Mesh(new PlaneGeometry(0.42, 0.46), new MeshLambertMaterial({ color: '#dce7dc', side: DoubleSide }))
    window.position.set(0.7, 1.06, 0.87)
    shed.add(window)
    const shedSign = this.createSign('RAIL SHED', '#f3e9d0', 180, 46)
    shedSign.scale.set(1.0, 0.28, 1)
    shedSign.position.set(0, 1.92, 0.88)
    shed.add(shedSign)
    shed.position.set(7.82, harbourStreetHeight(7.82, 7.32), 7.32)
    this.harbourStreet.add(shed)
    this.addHarbourStreetBlocker(7.82, 7.32, 1.28)

    const cart = new Group()
    const cartBody = new Mesh(new BoxGeometry(1.08, 0.34, 0.64), timber)
    cartBody.position.y = 0.42
    cart.add(cartBody)
    const handle = new Mesh(new BoxGeometry(0.1, 0.1, 0.94), timber)
    handle.position.set(0, 0.62, 0.66)
    handle.rotation.x = -0.3
    cart.add(handle)
    for (const xOffset of [-0.37, 0.37]) {
      const wheel = new Mesh(new CylinderGeometry(0.17, 0.17, 0.09, 7), iron)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(xOffset, 0.18, -0.22)
      cart.add(wheel)
    }
    const parcel = new Mesh(new BoxGeometry(0.44, 0.38, 0.38), new MeshLambertMaterial({ color: '#c58a48', flatShading: true }))
    parcel.position.set(-0.16, 0.77, -0.03)
    cart.add(parcel)
    cart.position.set(4.1, harbourStreetHeight(4.1, 7.15), 7.15)
    cart.rotation.y = -0.22
    this.harbourStreet.add(cart)
    this.addHarbourStreetBlocker(4.1, 7.15, 0.76)

    const lamp = new Group()
    const pole = new Mesh(new CylinderGeometry(0.06, 0.08, 1.72, 6), iron)
    pole.position.y = 0.86
    lamp.add(pole)
    const bulb = new Mesh(new SphereGeometry(0.13, 7, 5), new MeshLambertMaterial({ color: '#f5d873', emissive: new Color('#bf7d38'), emissiveIntensity: 0.7, flatShading: true }))
    bulb.position.y = 1.64
    lamp.add(bulb)
    lamp.position.set(2.78, harbourStreetHeight(2.78, 5.0), 5.0)
    this.harbourStreet.add(lamp)

    for (const [x, z, colour] of [[5.28, 7.72, '#c47447'], [5.85, 7.72, '#b76d43'], [6.4, 7.72, '#d19c52']] as Array<[number, number, string]>) {
      const crate = new Mesh(new BoxGeometry(0.46, 0.42, 0.44), new MeshLambertMaterial({ color: colour, flatShading: true }))
      crate.position.set(x, harbourStreetHeight(x, z) + 0.21, z)
      this.harbourStreet.add(crate)
      this.addHarbourStreetBlocker(x, z, 0.33)
    }
    for (const [x, z] of [[2.08, 5.45], [2.08, 6.55], [8.78, 5.45], [8.78, 6.55]] as Array<[number, number]>) {
      const buffer = new Mesh(new BoxGeometry(0.16, 0.48, 0.22), iron)
      buffer.position.set(x, harbourStreetHeight(x, z) + 0.24, z)
      this.harbourStreet.add(buffer)
      this.addHarbourStreetBlocker(x, z, 0.18)
    }
    const spurSign = this.createSign('FREIGHT SPUR', '#f1ebd4', 205, 48)
    spurSign.scale.set(1.12, 0.28, 1)
    spurSign.position.set(5.38, harbourStreetHeight(5.38, 4.72) + 1.18, 4.72)
    this.harbourStreet.add(spurSign)
  }

  /** The Rail Shed's short loading rails now curve into the harbour through-line. */
  private addHarbourRailLoopLink(): void {
    const route = new CatmullRomCurve3([
      new Vector3(8.46, harbourStreetHeight(8.46, 6.04) + 0.22, 6.04),
      new Vector3(8.72, harbourStreetHeight(8.72, 7.18) + 0.22, 7.18),
      new Vector3(9.2, harbourStreetHeight(9.2, 8.34) + 0.22, 8.34),
      new Vector3(10.38, harbourStreetHeight(10.38, 9.76) + 0.22, 9.76),
    ], false, 'centripetal')
    this.harbourStreet.add(new Mesh(new TubeGeometry(route, 36, 0.37, 5, false), new MeshLambertMaterial({ color: '#8e856d', flatShading: true })))
    const iron = new MeshLambertMaterial({ color: '#365258', flatShading: true })
    for (const offset of [-0.27, 0.27]) {
      const railPoints: Vector3[] = []
      for (let index = 0; index <= 22; index += 1) {
        const progress = index / 22
        const point = route.getPointAt(progress)
        const ahead = route.getPointAt(Math.min(1, progress + 0.02))
        const tangent = ahead.sub(point).normalize()
        railPoints.push(point.add(new Vector3(-tangent.z * offset, 0.03, tangent.x * offset)))
      }
      this.harbourStreet.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(railPoints, false, 'centripetal'), 36, 0.055, 5, false), iron))
    }
    const timber = new MeshLambertMaterial({ color: '#64493a', flatShading: true })
    for (let index = 0; index < 15; index += 1) {
      const progress = index / 15
      const point = route.getPointAt(progress)
      const ahead = route.getPointAt(Math.min(1, progress + 0.02))
      const sleeper = new Mesh(new BoxGeometry(0.98, 0.075, 0.13), timber)
      sleeper.position.copy(point).add(new Vector3(0, -0.055, 0))
      sleeper.rotation.y = Math.atan2(ahead.z - point.z, ahead.x - point.x) + Math.PI / 2
      this.harbourStreet.add(sleeper)
    }
    const sign = this.createSign('RAIL SHED → LOOP', '#f4ecd5', 205, 44)
    sign.scale.set(1.08, 0.26, 1)
    sign.position.set(9.88, harbourStreetHeight(9.88, 8.08) + 1.08, 8.08)
    this.harbourStreet.add(sign)
  }

  /**
   * The basin is deliberately shallow and crossed in the open. Its marked
   * stone ford gives Harbour Works a second waterside route without turning
   * the coast into a hard, rectangular gameplay boundary.
   */
  private addHarbourTidalBasinAndGardens(): void {
    const basinX = -10.85
    const basinZ = 2.3
    const basinWidth = 3.85
    const basinLength = 11.4
    const water = this.createHarbourStreetSurface(basinWidth, basinLength, basinX, basinZ, '#4e99a0', 0.105)
    this.harbourStreet.add(water)
    const shore = new MeshLambertMaterial({ color: '#b9a774', flatShading: true })
    for (const x of [basinX - basinWidth / 2 - 0.28, basinX + basinWidth / 2 + 0.28]) {
      const apron = this.createHarbourStreetSurface(0.5, basinLength + 0.18, x, basinZ, '#b9a774', 0.13)
      this.harbourStreet.add(apron)
    }

    const fordZ = 2.75
    const ford = this.createHarbourStreetSurface(basinWidth + 0.76, 1.12, basinX, fordZ, '#c9bb91', 0.18)
    this.harbourStreet.add(ford)
    for (let x = basinX - 1.98; x <= basinX + 1.98; x += 0.54) {
      const stone = new Mesh(new BoxGeometry(0.42, 0.07, 0.72), shore)
      stone.position.set(x, harbourStreetHeight(x, fordZ) + 0.23, fordZ)
      this.harbourStreet.add(stone)
    }

    const reedStem = new MeshLambertMaterial({ color: '#52735a', flatShading: true })
    const reedHead = new MeshLambertMaterial({ color: '#a77e4d', flatShading: true })
    for (const [x, z, height] of [
      [-12.55, -1.95, 0.76], [-12.72, 0.15, 0.94], [-12.54, 5.9, 0.7],
      [-9.16, -1.35, 0.86], [-9.04, 0.75, 0.72], [-9.16, 6.25, 0.98],
    ] as Array<[number, number, number]>) {
      const stem = new Mesh(new CylinderGeometry(0.025, 0.04, height, 4), reedStem)
      stem.position.set(x, harbourStreetHeight(x, z) + height / 2 + 0.13, z)
      stem.rotation.z = x < basinX ? -0.15 : 0.15
      this.harbourStreet.add(stem)
      const head = new Mesh(new CylinderGeometry(0.042, 0.057, height * 0.28, 4), reedHead)
      head.position.set(x + (x < basinX ? -0.02 : 0.02), harbourStreetHeight(x, z) + height + 0.13, z)
      head.rotation.z = stem.rotation.z
      this.harbourStreet.add(head)
    }
    for (let index = 0; index < 4; index += 1) {
      const ripple = new Mesh(new TorusGeometry(0.17 + index * 0.075, 0.018, 4, 10), new MeshLambertMaterial({ color: '#b6e0d3', transparent: true, opacity: 0.72, flatShading: true }))
      ripple.rotation.x = Math.PI / 2
      const x = basinX + (index % 2 === 0 ? -0.52 : 0.63)
      const z = -1.35 + index * 2.04
      ripple.position.set(x, harbourStreetHeight(x, z) + 0.16, z)
      this.harbourStreet.add(ripple)
    }
    const fordSign = this.createSign('LOW-TIDE FORD', '#eef2dc', 188, 44)
    fordSign.scale.set(1.0, 0.25, 1)
    fordSign.position.set(basinX, harbourStreetHeight(basinX, fordZ + 1.0) + 1.02, fordZ + 1.0)
    this.harbourStreet.add(fordSign)

    // Tide Gardens is the public, landward counterpart to the working quay.
    // The path keeps the garden linked to both the valve yard and Tidehouse Row.
    this.harbourStreet.add(this.createHarbourStreetSurface(2.0, 6.7, -5.85, 0.78, '#c2ae82', 0.125))
    this.harbourStreet.add(this.createHarbourStreetSurface(4.05, 4.55, -6.1, 4.98, '#83a96f', 0.135))
    const gardenStone = new MeshLambertMaterial({ color: '#b9aa82', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#70503d', flatShading: true })
    const leaf = new MeshLambertMaterial({ color: '#4f8b62', flatShading: true })
    const darkLeaf = new MeshLambertMaterial({ color: '#376d56', flatShading: true })
    for (const [x, z, scale] of [[-7.72, 4.25, 0.82], [-4.72, 5.62, 0.68]] as Array<[number, number, number]>) {
      const tree = new Group()
      const trunk = new Mesh(new CylinderGeometry(0.1, 0.15, 1.05 * scale, 5), timber)
      trunk.position.y = 0.52 * scale
      trunk.rotation.z = x < -6 ? -0.18 : 0.14
      tree.add(trunk)
      const crown = new Mesh(new ConeGeometry(0.9 * scale, 1.75 * scale, 6), x < -6 ? darkLeaf : leaf)
      crown.position.set(0.12 * (x < -6 ? -1 : 1), 1.56 * scale, 0)
      crown.rotation.z = trunk.rotation.z
      tree.add(crown)
      tree.position.set(x, harbourStreetHeight(x, z), z)
      this.harbourStreet.add(tree)
      this.addHarbourStreetBlocker(x, z, 0.72 * scale)
    }

    const bench = new Group()
    const seat = new Mesh(new BoxGeometry(1.24, 0.13, 0.34), timber)
    seat.position.y = 0.42
    bench.add(seat)
    const back = new Mesh(new BoxGeometry(1.24, 0.32, 0.08), timber)
    back.position.set(0, 0.61, 0.14)
    bench.add(back)
    bench.position.set(-5.68, harbourStreetHeight(-5.68, 4.28), 4.28)
    bench.rotation.y = -0.22
    this.harbourStreet.add(bench)
    this.addHarbourStreetBlocker(-5.68, 4.28, 0.68)

    const tideSeat = new Group()
    const base = new Mesh(new CylinderGeometry(0.5, 0.64, 0.26, 8), gardenStone)
    base.position.y = 0.13
    tideSeat.add(base)
    const face = new Mesh(new CylinderGeometry(0.32, 0.32, 0.04, 8), new MeshLambertMaterial({ color: '#d6c16e', flatShading: true }))
    face.position.y = 0.28
    tideSeat.add(face)
    const hand = new Mesh(new BoxGeometry(0.045, 0.025, 0.34), new MeshLambertMaterial({ color: '#42636a', flatShading: true }))
    hand.position.set(0.08, 0.32, 0)
    hand.rotation.y = 0.52
    tideSeat.add(hand)
    tideSeat.position.set(-6.65, harbourStreetHeight(-6.65, 6.02), 6.02)
    this.harbourStreet.add(tideSeat)
    this.addHarbourStreetBlocker(-6.65, 6.02, 0.63)

    for (const [x, z] of [[-7.92, 6.12], [-4.34, 4.0]] as Array<[number, number]>) {
      const lamp = new Group()
      const pole = new Mesh(new CylinderGeometry(0.055, 0.075, 1.66, 6), new MeshLambertMaterial({ color: '#34565d', flatShading: true }))
      pole.position.y = 0.83
      lamp.add(pole)
      const glow = new Mesh(new SphereGeometry(0.12, 7, 5), new MeshLambertMaterial({ color: '#f5d873', emissive: new Color('#bd7a37'), emissiveIntensity: 0.7, flatShading: true }))
      glow.position.y = 1.58
      lamp.add(glow)
      lamp.position.set(x, harbourStreetHeight(x, z), z)
      this.harbourStreet.add(lamp)
    }
    const gardenSign = this.createSign('TIDE GARDENS', '#f1ead4', 196, 46)
    gardenSign.scale.set(1.08, 0.27, 1)
    gardenSign.position.set(-6.08, harbourStreetHeight(-6.08, 6.82) + 1.12, 6.82)
    this.harbourStreet.add(gardenSign)
  }

  /**
   * The rail shed now leads somewhere useful: a compact chandlery keeps the
   * north-east shoulder working while leaving a generous paved turn through
   * its middle. It is a destination, not a decorative cul-de-sac.
   */
  private addHarbourChandleryYard(): void {
    this.harbourStreet.add(this.createHarbourStreetSurface(7.4, 2.45, 11.05, 7.65, '#a98a67', 0.125))
    this.harbourStreet.add(this.createHarbourStreetSurface(4.8, 3.7, 12.85, 9.32, '#b29a74', 0.135))

    const paleStone = new MeshLambertMaterial({ color: '#d8c9a5', flatShading: true })
    const warmStone = new MeshLambertMaterial({ color: '#a48b68', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#6b4c3b', flatShading: true })
    const brick = new MeshLambertMaterial({ color: '#a85d49', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#334f55', flatShading: true })
    const iron = new MeshLambertMaterial({ color: '#34565d', flatShading: true })

    for (let x = 9.0; x <= 15.05; x += 0.52) {
      for (let z = 6.64; z <= 8.58; z += 0.48) {
        const paver = new Mesh(new BoxGeometry(0.42, 0.04, 0.38), (Math.round((x + z) * 2) % 2 === 0) ? paleStone : warmStone)
        paver.position.set(x, harbourStreetHeight(x, z) + 0.18, z)
        this.harbourStreet.add(paver)
      }
    }
    for (let x = 10.8; x <= 15.05; x += 0.5) {
      for (let z = 8.42; z <= 10.55; z += 0.5) {
        const paver = new Mesh(new BoxGeometry(0.4, 0.04, 0.4), (Math.round((x - z) * 2) % 2 === 0) ? warmStone : paleStone)
        paver.position.set(x, harbourStreetHeight(x, z) + 0.185, z)
        this.harbourStreet.add(paver)
      }
    }

    const shopX = 15.0
    const shopZ = 9.38
    const shop = new Group()
    const shopBody = new Mesh(new BoxGeometry(2.32, 1.7, 1.72), brick)
    shopBody.position.y = 0.85
    shop.add(shopBody)
    const shopRoof = new Mesh(new ConeGeometry(1.6, 0.74, 4), slate)
    shopRoof.rotation.y = Math.PI / 4
    shopRoof.position.y = 2.04
    shop.add(shopRoof)
    const shopDoor = new Mesh(new PlaneGeometry(0.62, 0.96), new MeshLambertMaterial({ color: '#294d53', side: DoubleSide }))
    shopDoor.position.set(-0.43, 0.5, 0.87)
    shop.add(shopDoor)
    const shopWindow = new Mesh(new PlaneGeometry(0.52, 0.52), new MeshLambertMaterial({ color: '#dbe8dc', side: DoubleSide }))
    shopWindow.position.set(0.48, 1.01, 0.875)
    shop.add(shopWindow)
    const shopSign = this.createSign('CHANDLERY', '#f4ebd1', 190, 46)
    shopSign.scale.set(1.05, 0.27, 1)
    shopSign.position.set(0, 1.95, 0.88)
    shop.add(shopSign)
    const chimney = new Mesh(new BoxGeometry(0.25, 0.92, 0.25), new MeshLambertMaterial({ color: '#744138', flatShading: true }))
    chimney.position.set(0.64, 2.12, -0.32)
    shop.add(chimney)
    shop.position.set(shopX, harbourStreetHeight(shopX, shopZ), shopZ)
    this.harbourStreet.add(shop)
    this.addHarbourStreetBlocker(shopX, shopZ, 1.32)

    const sailRack = new Group()
    for (const xOffset of [-0.78, 0.78]) {
      const post = new Mesh(new BoxGeometry(0.11, 1.68, 0.11), timber)
      post.position.set(xOffset, 0.84, 0)
      sailRack.add(post)
    }
    const crossbar = new Mesh(new BoxGeometry(1.82, 0.1, 0.1), timber)
    crossbar.position.y = 1.47
    sailRack.add(crossbar)
    for (const [xOffset, color] of [[-0.42, '#d4c56f'], [0.08, '#6f9c9a'], [0.47, '#d07b55']] as Array<[number, string]>) {
      const sail = new Mesh(new PlaneGeometry(0.36, 0.82), new MeshLambertMaterial({ color, side: DoubleSide }))
      sail.position.set(xOffset, 0.98, 0.06)
      sailRack.add(sail)
    }
    sailRack.position.set(11.62, harbourStreetHeight(11.62, 9.42), 9.42)
    this.harbourStreet.add(sailRack)
    this.addHarbourStreetBlocker(11.62, 9.42, 0.94)

    const capstan = new Group()
    const base = new Mesh(new CylinderGeometry(0.34, 0.42, 0.38, 7), warmStone)
    base.position.y = 0.19
    capstan.add(base)
    const post = new Mesh(new CylinderGeometry(0.12, 0.16, 0.8, 6), iron)
    post.position.y = 0.58
    capstan.add(post)
    const arm = new Mesh(new BoxGeometry(1.05, 0.08, 0.09), timber)
    arm.position.set(0, 0.84, 0)
    arm.rotation.y = 0.24
    capstan.add(arm)
    capstan.position.set(13.15, harbourStreetHeight(13.15, 7.72), 7.72)
    this.harbourStreet.add(capstan)
    this.addHarbourStreetBlocker(13.15, 7.72, 0.48)

    const crateStack = new Group()
    for (const [xOffset, y, color] of [[-0.23, 0.23, '#b46e45'], [0.26, 0.23, '#ca934d'], [0.0, 0.67, '#d2a555']] as Array<[number, number, string]>) {
      const crate = new Mesh(new BoxGeometry(0.46, 0.42, 0.44), new MeshLambertMaterial({ color, flatShading: true }))
      crate.position.set(xOffset, y, 0)
      crateStack.add(crate)
    }
    crateStack.position.set(14.36, harbourStreetHeight(14.36, 7.18), 7.18)
    this.harbourStreet.add(crateStack)
    this.addHarbourStreetBlocker(14.36, 7.18, 0.58)

    for (const z of [7.0, 9.25, 10.48]) {
      const lamp = new Group()
      const pole = new Mesh(new CylinderGeometry(0.055, 0.075, 1.66, 6), iron)
      pole.position.y = 0.83
      lamp.add(pole)
      const glow = new Mesh(new SphereGeometry(0.12, 7, 5), new MeshLambertMaterial({ color: '#f5d873', emissive: new Color('#bd7a37'), emissiveIntensity: 0.7, flatShading: true }))
      glow.position.y = 1.58
      lamp.add(glow)
      lamp.position.set(10.35, harbourStreetHeight(10.35, z), z)
      this.harbourStreet.add(lamp)
    }

    const yardSign = this.createSign('CHANDLERY YARD', '#f1ead4', 222, 48)
    yardSign.scale.set(1.2, 0.28, 1)
    yardSign.position.set(11.15, harbourStreetHeight(11.15, 6.45) + 1.16, 6.45)
    this.harbourStreet.add(yardSign)
  }

  /**
   * Tidehouse Row fills Harbour Works' quiet north-west shoulder with a small,
   * legible working street. It branches directly from the main road and keeps
   * its middle clear, so the new detail is a destination rather than a trap.
   */
  private addHarbourTidehouseRow(): void {
    this.harbourStreet.add(this.createHarbourStreetSurface(7.1, 3.15, -5.25, 7.75, '#a98a67', 0.12))
    this.harbourStreet.add(this.createHarbourStreetSurface(2.45, 2.1, -7.55, 9.38, '#927454', 0.13))

    const paleStone = new MeshLambertMaterial({ color: '#c9bb95', flatShading: true })
    const darkStone = new MeshLambertMaterial({ color: '#947f62', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#6b4c3b', flatShading: true })
    const brick = new MeshLambertMaterial({ color: '#ae624b', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#314f56', flatShading: true })
    const sailcloth = new MeshLambertMaterial({ color: '#d7cfa8', flatShading: true })
    const iron = new MeshLambertMaterial({ color: '#34565d', flatShading: true })

    for (let x = -8.45; x <= -2.2; x += 0.52) {
      for (let z = 6.55; z <= 8.95; z += 0.5) {
        const paver = new Mesh(new BoxGeometry(0.42, 0.04, 0.4), (Math.round((x + z) * 2) % 2 === 0) ? paleStone : darkStone)
        paver.position.set(x, harbourStreetHeight(x, z) + 0.17, z)
        this.harbourStreet.add(paver)
      }
    }

    const tidehouse = new Group()
    const houseBody = new Mesh(new BoxGeometry(2.22, 1.68, 1.72), brick)
    houseBody.position.y = 0.84
    tidehouse.add(houseBody)
    const houseRoof = new Mesh(new ConeGeometry(1.52, 0.72, 4), slate)
    houseRoof.rotation.y = Math.PI / 4
    houseRoof.position.y = 1.98
    tidehouse.add(houseRoof)
    const door = new Mesh(new PlaneGeometry(0.58, 0.94), new MeshLambertMaterial({ color: '#294d54', side: DoubleSide }))
    door.position.set(-0.4, 0.5, 0.868)
    tidehouse.add(door)
    const window = new Mesh(new PlaneGeometry(0.5, 0.52), new MeshLambertMaterial({ color: '#dce9dc', side: DoubleSide }))
    window.position.set(0.46, 1.0, 0.873)
    tidehouse.add(window)
    const houseSign = this.createSign('TIDEHOUSE', '#f2ead1', 180, 46)
    houseSign.scale.set(1.0, 0.28, 1)
    houseSign.position.set(0, 1.9, 0.88)
    tidehouse.add(houseSign)
    tidehouse.position.set(-7.72, harbourStreetHeight(-7.72, 9.4), 9.4)
    this.harbourStreet.add(tidehouse)
    this.addHarbourStreetBlocker(-7.72, 9.4, 1.28)

    const dryingRack = new Group()
    for (const xOffset of [-0.84, 0.84]) {
      const post = new Mesh(new BoxGeometry(0.1, 1.62, 0.1), timber)
      post.position.set(xOffset, 0.81, 0)
      dryingRack.add(post)
    }
    const crossbar = new Mesh(new BoxGeometry(1.88, 0.09, 0.09), timber)
    crossbar.position.y = 1.42
    dryingRack.add(crossbar)
    for (const xOffset of [-0.48, 0, 0.48]) {
      const net = new Mesh(new PlaneGeometry(0.34, 0.7), new MeshLambertMaterial({ color: xOffset === 0 ? '#5d9ba0' : '#d7c86f', side: DoubleSide }))
      net.position.set(xOffset, 0.9, 0.045)
      dryingRack.add(net)
    }
    const awning = new Mesh(new BoxGeometry(2.1, 0.1, 0.72), sailcloth)
    awning.position.set(0, 1.58, -0.12)
    dryingRack.add(awning)
    dryingRack.position.set(-4.45, harbourStreetHeight(-4.45, 8.9), 8.9)
    this.harbourStreet.add(dryingRack)
    this.addHarbourStreetBlocker(-4.45, 8.9, 0.98)

    const gaugeX = -2.92
    const gaugeZ = 8.88
    const gaugePost = new Mesh(new BoxGeometry(0.12, 1.58, 0.12), iron)
    gaugePost.position.set(gaugeX, harbourStreetHeight(gaugeX, gaugeZ) + 0.79, gaugeZ)
    this.harbourStreet.add(gaugePost)
    for (let index = 0; index < 4; index += 1) {
      const tick = new Mesh(new BoxGeometry(0.28, 0.045, 0.03), new MeshLambertMaterial({ color: index === 2 ? '#cf7350' : '#ecdfb7', flatShading: true }))
      tick.position.set(gaugeX, harbourStreetHeight(gaugeX, gaugeZ) + 0.34 + index * 0.28, gaugeZ + 0.07)
      this.harbourStreet.add(tick)
    }
    const gaugeSign = this.createSign('TIDE', '#eef1d6', 92, 40)
    gaugeSign.scale.set(0.56, 0.21, 1)
    gaugeSign.position.set(gaugeX, harbourStreetHeight(gaugeX, gaugeZ) + 1.63, gaugeZ)
    this.harbourStreet.add(gaugeSign)

    for (const [x, z, color] of [[-6.25, 7.08, '#a66b43'], [-5.68, 7.12, '#cc934d'], [-3.45, 7.12, '#865d45']] as Array<[number, number, string]>) {
      const barrel = new Mesh(new CylinderGeometry(0.24, 0.28, 0.62, 7), new MeshLambertMaterial({ color, flatShading: true }))
      barrel.position.set(x, harbourStreetHeight(x, z) + 0.31, z)
      this.harbourStreet.add(barrel)
      this.addHarbourStreetBlocker(x, z, 0.32)
    }
    for (const [x, z] of [[-8.35, 7.12], [-1.98, 7.12], [-5.2, 6.42]] as Array<[number, number]>) {
      const lamp = new Group()
      const pole = new Mesh(new CylinderGeometry(0.055, 0.075, 1.72, 6), iron)
      pole.position.y = 0.86
      lamp.add(pole)
      const glow = new Mesh(new SphereGeometry(0.12, 7, 5), new MeshLambertMaterial({ color: '#f5d873', emissive: new Color('#bd7a37'), emissiveIntensity: 0.7, flatShading: true }))
      glow.position.y = 1.64
      lamp.add(glow)
      lamp.position.set(x, harbourStreetHeight(x, z), z)
      this.harbourStreet.add(lamp)
    }
    const rowSign = this.createSign('TIDEHOUSE ROW', '#f1ead2', 205, 48)
    rowSign.scale.set(1.14, 0.28, 1)
    rowSign.position.set(-5.25, harbourStreetHeight(-5.25, 6.35) + 1.2, 6.35)
    this.harbourStreet.add(rowSign)
  }

  /** A local person gives the dock story a voice without becoming a schedule simulation. */
  private addHarbourDockKeeper(x: number, z: number): void {
    const keeper = new Group()
    const coat = new Mesh(new CylinderGeometry(0.28, 0.36, 0.9, 6), new MeshLambertMaterial({ color: '#3e7b83', flatShading: true }))
    coat.position.y = 0.54
    keeper.add(coat)
    const apron = new Mesh(new BoxGeometry(0.42, 0.52, 0.08), new MeshLambertMaterial({ color: '#d7b45a', flatShading: true }))
    apron.position.set(0, 0.48, 0.31)
    keeper.add(apron)
    const head = new Mesh(new SphereGeometry(0.24, 8, 6), new MeshLambertMaterial({ color: '#c88f70', flatShading: true }))
    head.position.y = 1.15
    keeper.add(head)
    const cap = new Mesh(new CylinderGeometry(0.29, 0.31, 0.1, 7), new MeshLambertMaterial({ color: '#294e55', flatShading: true }))
    cap.position.y = 1.36
    keeper.add(cap)
    keeper.position.set(x, harbourStreetHeight(x, z), z)
    this.harbourStreet.add(keeper)
    this.addHarbourStreetBlocker(x, z, 0.38)
  }

  private createHarbourStreetSurface(width: number, length: number, x: number, z: number, color: string, offset: number): Mesh {
    const geometry = new PlaneGeometry(width, length, Math.max(2, Math.ceil(width)), Math.max(4, Math.ceil(length / 1.5)))
    const positions = geometry.getAttribute('position')
    for (let index = 0; index < positions.count; index += 1) positions.setZ(index, harbourStreetHeight(x + positions.getX(index), z - positions.getY(index)) + offset)
    geometry.computeVertexNormals()
    geometry.rotateX(-Math.PI / 2)
    const surface = new Mesh(geometry, new MeshLambertMaterial({ color, flatShading: true, side: DoubleSide }))
    surface.position.set(x, 0, z)
    return surface
  }

  private addHarbourStreetMarker(id: 'harbour-valve' | 'harbour-pump', label: string, requiredStage: 'first' | 'second', x: number, z: number, text: string): void {
    const marker = new Group()
    const blue = new MeshLambertMaterial({ color: '#4b9ec2', flatShading: true })
    const base = new Mesh(new CylinderGeometry(0.22, 0.28, 0.36, 5), blue)
    base.position.y = 0.18
    marker.add(base)
    const glow = new Mesh(new SphereGeometry(0.17, 8, 6), new MeshLambertMaterial({ color: '#d8f2dd', emissive: new Color('#4b9ec2'), emissiveIntensity: 0.9, flatShading: true }))
    glow.position.y = 0.65
    marker.add(glow)
    const sign = this.createSign(label, '#eff6dc', 190, 52)
    sign.scale.set(1.08, 0.3, 1)
    sign.position.y = 1.12
    marker.add(sign)
    const height = harbourStreetHeight(x, z)
    marker.position.set(x, height, z)
    this.harbourStreet.add(marker)
    this.harbourStreetSideMarkers.push({ id, label, sideQuest: 'harbour', requiredStage, district: 'harbour', text, mesh: marker, position: [x, height, z] })
  }

  private addHarbourStreetBlocker(x: number, z: number, radius: number): void {
    this.harbourStreetBlockers.push({ center: new Vector3(x, 0, z), radius })
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

  /** Street-scale Moonhill: a stable, shallowly rolling hilltop around the observatory. */
  private createObservatoryStreetWorld(): void {
    this.observatoryStreet.visible = false
    this.observatoryStreet.add(this.createStreetHorizon(138, 126, observatoryStreetHeight, '#718a78'))
    this.observatoryStreet.add(this.createObservatoryStreetSurface(4.8, 25, 0, -1.1, '#5b6975', 0.09))
    this.observatoryStreet.add(this.createObservatoryStreetSurface(9.4, 5.2, 0, -7.2, '#b9ad93', 0.13))

    const stone = new MeshLambertMaterial({ color: '#d9d5bf', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#424c75', flatShading: true })
    const brass = new MeshLambertMaterial({ color: '#d6ad62', flatShading: true })
    const dome = new Group()
    const base = new Mesh(new CylinderGeometry(2.15, 2.35, 1.7, 10), stone)
    base.position.y = 0.85
    dome.add(base)
    const roof = new Mesh(new SphereGeometry(2.18, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), slate)
    roof.position.y = 1.72
    dome.add(roof)
    const door = new Mesh(new PlaneGeometry(0.72, 1.05), new MeshLambertMaterial({ color: '#315a65', side: DoubleSide }))
    door.position.set(0, 0.58, 2.18)
    dome.add(door)
    const domeSign = this.createSign('MOONHILL', '#f0dc83', 250, 58)
    domeSign.scale.set(1.42, 0.34, 1)
    domeSign.position.set(0, 3.18, 2.22)
    dome.add(domeSign)
    dome.position.set(0, observatoryStreetHeight(0, -7.35), -7.35)
    this.observatoryStreet.add(dome)
    this.addObservatoryStreetBlocker(0, -7.35, 2.45)

    const telescope = new Group()
    const pedestal = new Mesh(new CylinderGeometry(0.3, 0.47, 1.18, 7), new MeshLambertMaterial({ color: '#6d5b8a', flatShading: true }))
    pedestal.position.y = 0.59
    telescope.add(pedestal)
    const tube = new Mesh(new CylinderGeometry(0.18, 0.28, 2.2, 8), new MeshLambertMaterial({ color: '#d9d3e9', flatShading: true }))
    tube.rotation.z = Math.PI / 3.1
    tube.position.set(0.68, 1.5, 0)
    telescope.add(tube)
    const localLens = new Mesh(new SphereGeometry(0.22, 8, 6), this.observatoryBeacon ?? new MeshLambertMaterial({ color: '#8975bc', flatShading: true }))
    localLens.position.set(1.28, 1.94, 0)
    telescope.add(localLens)
    telescope.position.set(1.5, observatoryStreetHeight(1.5, -3.85), -3.85)
    this.observatoryStreet.add(telescope)
    this.addObservatoryStreetBlocker(1.5, -3.85, 1.02)

    const pathStone = new MeshLambertMaterial({ color: '#aa9c87', flatShading: true })
    for (let index = 0; index < 9; index += 1) {
      const z = -3.05 - index * 0.38
      const slab = new Mesh(new BoxGeometry(2.1, 0.09, 0.29), pathStone)
      slab.position.set(0, observatoryStreetHeight(0, z) + 0.15, z)
      this.observatoryStreet.add(slab)
    }
    const railMaterial = new MeshLambertMaterial({ color: '#53616d', flatShading: true })
    for (const x of [-1.32, 1.32]) {
      const rail = new Mesh(new BoxGeometry(0.06, 0.06, 3.45), railMaterial)
      rail.position.set(x, observatoryStreetHeight(x, -4.65) + 0.66, -4.65)
      this.observatoryStreet.add(rail)
      for (const z of [-3.15, -4.7, -6.05]) {
        const post = new Mesh(new CylinderGeometry(0.045, 0.06, 0.8, 5), railMaterial)
        post.position.set(x, observatoryStreetHeight(x, z) + 0.4, z)
        this.observatoryStreet.add(post)
      }
    }

    const wallMaterial = new MeshLambertMaterial({ color: '#989a89', flatShading: true })
    for (const x of [-5.2, -3.9, 3.9, 5.2]) {
      const wall = new Mesh(new BoxGeometry(0.95, 0.56, 0.28), wallMaterial)
      wall.position.set(x, observatoryStreetHeight(x, -5.5) + 0.28, -5.5)
      this.observatoryStreet.add(wall)
      this.addObservatoryStreetBlocker(x, -5.5, 0.45)
    }
    for (const [x, z, height] of [[-7.6, -0.4, 2.4], [5.6, -1.4, 2.1], [-4.8, -9.4, 2.6], [4.6, -9.6, 2.25]] as Array<[number, number, number]>) {
      const pine = new Group()
      const trunk = new Mesh(new CylinderGeometry(0.1, 0.15, height * 0.38, 5), new MeshLambertMaterial({ color: '#55443d', flatShading: true }))
      trunk.position.y = height * 0.19
      pine.add(trunk)
      const crown = new Mesh(new ConeGeometry(height * 0.32, height, 6), new MeshLambertMaterial({ color: '#355f59', flatShading: true }))
      crown.position.y = height * 0.72
      pine.add(crown)
      pine.position.set(x, observatoryStreetHeight(x, z), z)
      this.observatoryStreet.add(pine)
      this.addObservatoryStreetBlocker(x, z, 0.62)
    }
    this.addMoonhillLookout()
    this.addMoonhillArchiveTerrace()
    this.addMoonhillLensPath()
    this.addMoonhillSignalTerrace()
    this.addMoonhillSignalTerraceLoopLink()
    this.addStreetLoopSection('observatory', this.observatoryStreet, observatoryStreetHeight, [
      [-14.4, 9.1], [-15.1, 1.6], [-13.4, -6.8], [-8.6, -12.6], [0, -14.3], [9.1, -11.8], [14.2, -5.1], [15.1, 2.6], [12.1, 9.6], [4.7, 13.4], [-5.5, 13.6],
    ], 'TO NIGHTFALL CUTTING', 9.8, 9.6)
    this.addMoonhillAlmanacGarden()
    this.addMoonhillCometWalk()
    this.addMoonhillSpringCrossingAndHighStreet()
    this.addMoonhillSignalLights()
    this.addMoonhillWarden(-2.55, -1.5)
    this.addObservatoryStreetMarker('observatory-lens', 'Starlight lens', 'first', -5.5, -2.2, 'A starlight lens rests beside the hill path. The telescope can see again.')
    this.addObservatoryStreetMarker('observatory-scope', 'Align scope', 'second', 1.5, -3.85, 'The moon signal crosses the glass. Every faraway station gets one clear night.')
    this.updateSideQuestMarkers()
    this.createObservatoryStreetLife()
    this.scene.add(this.observatoryStreet)
  }

  /** A second, quiet route off the telescope path: Moonhill's wind lookout. */
  private addMoonhillLookout(): void {
    const stone = new MeshLambertMaterial({ color: '#aaa592', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#654d42', flatShading: true })
    const moss = new MeshLambertMaterial({ color: '#466c61', flatShading: true })
    this.observatoryStreet.add(this.createObservatoryStreetSurface(6.2, 3.6, -5.25, -7.7, '#a99f8a', 0.15))
    const shelter = new Group()
    const frame = new Mesh(new BoxGeometry(1.85, 1.15, 1.25), timber)
    frame.position.y = 0.58
    shelter.add(frame)
    const openFront = new Mesh(new PlaneGeometry(1.05, 0.72), new MeshLambertMaterial({ color: '#304f54', side: DoubleSide }))
    openFront.position.set(0, 0.58, 0.631)
    shelter.add(openFront)
    const roof = new Mesh(new ConeGeometry(1.35, 0.7, 4), new MeshLambertMaterial({ color: '#364e5a', flatShading: true }))
    roof.rotation.y = Math.PI / 4
    roof.position.y = 1.48
    shelter.add(roof)
    shelter.position.set(-7.05, observatoryStreetHeight(-7.05, -7.55), -7.55)
    this.observatoryStreet.add(shelter)
    this.addObservatoryStreetBlocker(-7.05, -7.55, 1.14)

    const chartTable = new Group()
    const leg = new Mesh(new CylinderGeometry(0.08, 0.11, 0.68, 5), timber)
    leg.position.y = 0.34
    chartTable.add(leg)
    const chart = new Mesh(new CylinderGeometry(0.58, 0.58, 0.08, 7), new MeshLambertMaterial({ color: '#d8d3be', flatShading: true }))
    chart.position.y = 0.7
    chartTable.add(chart)
    for (const angle of [0.2, 2.1, 4.3]) {
      const star = new Mesh(new SphereGeometry(0.045, 5, 4), new MeshLambertMaterial({ color: '#d4b669', emissive: new Color('#8f7138'), emissiveIntensity: 0.4, flatShading: true }))
      star.position.set(Math.cos(angle) * 0.3, 0.76, Math.sin(angle) * 0.3)
      chartTable.add(star)
    }
    chartTable.position.set(-3.8, observatoryStreetHeight(-3.8, -7.6), -7.6)
    this.observatoryStreet.add(chartTable)
    this.addObservatoryStreetBlocker(-3.8, -7.6, 0.64)

    for (const x of [-7.95, -6.8, -5.65, -4.5, -3.35]) {
      const parapet = new Mesh(new BoxGeometry(0.9, 0.55, 0.3), stone)
      parapet.position.set(x, observatoryStreetHeight(x, -9.15) + 0.28, -9.15)
      this.observatoryStreet.add(parapet)
      this.addObservatoryStreetBlocker(x, -9.15, 0.43)
    }
    const fireBowl = new Group()
    const bowl = new Mesh(new CylinderGeometry(0.28, 0.38, 0.22, 7), stone)
    bowl.position.y = 0.16
    fireBowl.add(bowl)
    const flame = new Mesh(new ConeGeometry(0.17, 0.44, 5), new MeshLambertMaterial({ color: '#e6bd5b', emissive: new Color('#bf6b3b'), emissiveIntensity: 0.7, flatShading: true }))
    flame.position.y = 0.48
    fireBowl.add(flame)
    fireBowl.position.set(-5.15, observatoryStreetHeight(-5.15, -6.4), -6.4)
    this.observatoryStreet.add(fireBowl)
    this.addObservatoryStreetBlocker(-5.15, -6.4, 0.42)

    const lookoutSign = this.createSign('WIND LOOKOUT', '#eee8d1', 220, 48)
    lookoutSign.scale.set(1.2, 0.28, 1)
    lookoutSign.position.set(-5.3, observatoryStreetHeight(-5.3, -5.95) + 1.24, -5.95)
    this.observatoryStreet.add(lookoutSign)
    // A low mossy edge reads as a protected viewpoint without fencing the path.
    for (const [x, z] of [[-8.35, -6.4], [-8.45, -8.55], [-2.45, -8.65]] as Array<[number, number]>) {
      const rock = new Mesh(new ConeGeometry(0.42, 0.48, 6), moss)
      rock.rotation.x = Math.PI
      rock.position.set(x, observatoryStreetHeight(x, z) + 0.24, z)
      this.observatoryStreet.add(rock)
      this.addObservatoryStreetBlocker(x, z, 0.38)
    }
  }

  /**
   * The observatory's eastern shoulder becomes a quiet working terrace rather
   * than unused grass: records, a simple orrery and a protected edge make a
   * small destination that never blocks the telescope route.
   */
  private addMoonhillArchiveTerrace(): void {
    const stone = new MeshLambertMaterial({ color: '#a9a294', flatShading: true })
    const paleStone = new MeshLambertMaterial({ color: '#d8d4bd', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#665047', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#404c72', flatShading: true })
    const brass = new MeshLambertMaterial({ color: '#c8a363', emissive: new Color('#705b39'), emissiveIntensity: 0.22, flatShading: true })

    this.observatoryStreet.add(this.createObservatoryStreetSurface(6.5, 3.6, 5.35, -7.65, '#aaa397', 0.15))
    this.observatoryStreet.add(this.createObservatoryStreetSurface(2.7, 2.1, 3.0, -5.85, '#a39c91', 0.14))
    for (let x = 2.35; x <= 8.05; x += 0.56) {
      for (let z = -9.05; z <= -6.25; z += 0.54) {
        const slab = new Mesh(new BoxGeometry(0.46, 0.04, 0.41), (Math.round((x - z) * 2) % 2 === 0) ? stone : paleStone)
        slab.position.set(x, observatoryStreetHeight(x, z) + 0.2, z)
        this.observatoryStreet.add(slab)
      }
    }

    const archive = new Group()
    const body = new Mesh(new BoxGeometry(1.78, 1.38, 1.44), new MeshLambertMaterial({ color: '#6e7c7a', flatShading: true }))
    body.position.y = 0.69
    archive.add(body)
    const roof = new Mesh(new ConeGeometry(1.18, 0.63, 4), slate)
    roof.rotation.y = Math.PI / 4
    roof.position.y = 1.65
    archive.add(roof)
    const door = new Mesh(new PlaneGeometry(0.54, 0.86), new MeshLambertMaterial({ color: '#314f59', side: DoubleSide }))
    door.position.set(-0.32, 0.46, 0.726)
    archive.add(door)
    const archiveWindow = new Mesh(new PlaneGeometry(0.41, 0.42), new MeshLambertMaterial({ color: '#d7e1d7', side: DoubleSide }))
    archiveWindow.position.set(0.43, 0.9, 0.73)
    archive.add(archiveWindow)
    const archiveSign = this.createSign('STAR ARCHIVE', '#eee8d1', 190, 46)
    archiveSign.scale.set(1.06, 0.28, 1)
    archiveSign.position.set(0, 1.72, 0.735)
    archive.add(archiveSign)
    archive.position.set(7.15, observatoryStreetHeight(7.15, -8.0), -8.0)
    this.observatoryStreet.add(archive)
    this.addObservatoryStreetBlocker(7.15, -8.0, 1.1)

    const orrery = new Group()
    const plinth = new Mesh(new CylinderGeometry(0.46, 0.58, 0.68, 8), stone)
    plinth.position.y = 0.34
    orrery.add(plinth)
    const ringOne = new Mesh(new TorusGeometry(0.72, 0.045, 6, 16), brass)
    ringOne.rotation.x = Math.PI / 2.8
    ringOne.position.y = 1.0
    orrery.add(ringOne)
    const ringTwo = new Mesh(new TorusGeometry(0.5, 0.04, 6, 14), brass)
    ringTwo.rotation.z = Math.PI / 2.7
    ringTwo.position.y = 1.0
    orrery.add(ringTwo)
    const sun = new Mesh(new SphereGeometry(0.14, 7, 6), new MeshLambertMaterial({ color: '#f0d674', emissive: new Color('#c18a3f'), emissiveIntensity: 0.65, flatShading: true }))
    sun.position.y = 1.0
    orrery.add(sun)
    const moon = new Mesh(new SphereGeometry(0.08, 6, 5), new MeshLambertMaterial({ color: '#d8e3df', flatShading: true }))
    moon.position.set(0.61, 1.14, 0)
    orrery.add(moon)
    orrery.position.set(4.65, observatoryStreetHeight(4.65, -7.1), -7.1)
    this.observatoryStreet.add(orrery)
    this.addObservatoryStreetBlocker(4.65, -7.1, 0.72)

    const desk = new Group()
    const legs = new Mesh(new CylinderGeometry(0.07, 0.09, 0.68, 5), timber)
    legs.position.y = 0.34
    desk.add(legs)
    const top = new Mesh(new BoxGeometry(1.12, 0.1, 0.62), timber)
    top.position.y = 0.72
    desk.add(top)
    const chart = new Mesh(new PlaneGeometry(0.62, 0.34), new MeshLambertMaterial({ color: '#e7dfc4', side: DoubleSide }))
    chart.rotation.x = -Math.PI / 2
    chart.position.set(-0.05, 0.775, 0)
    desk.add(chart)
    desk.position.set(3.55, observatoryStreetHeight(3.55, -8.25), -8.25)
    desk.rotation.y = 0.2
    this.observatoryStreet.add(desk)
    this.addObservatoryStreetBlocker(3.55, -8.25, 0.6)

    for (const [x, z] of [[2.55, -9.28], [4.15, -9.28], [5.75, -9.28], [7.35, -9.28], [8.0, -7.15]] as Array<[number, number]>) {
      const parapet = new Mesh(new BoxGeometry(0.72, 0.52, 0.28), stone)
      parapet.position.set(x, observatoryStreetHeight(x, z) + 0.26, z)
      this.observatoryStreet.add(parapet)
      this.addObservatoryStreetBlocker(x, z, 0.36)
    }
    const brassRail = new Mesh(new BoxGeometry(5.1, 0.055, 0.055), brass)
    brassRail.position.set(5.1, observatoryStreetHeight(5.1, -9.28) + 0.7, -9.28)
    this.observatoryStreet.add(brassRail)

    const archiveLamp = new Group()
    const post = new Mesh(new CylinderGeometry(0.05, 0.075, 1.56, 6), timber)
    post.position.y = 0.78
    archiveLamp.add(post)
    const lamp = new Mesh(new SphereGeometry(0.12, 7, 5), new MeshLambertMaterial({ color: '#f3d67a', emissive: new Color('#bd8043'), emissiveIntensity: 0.72, flatShading: true }))
    lamp.position.y = 1.54
    archiveLamp.add(lamp)
    archiveLamp.position.set(2.55, observatoryStreetHeight(2.55, -6.65), -6.65)
    this.observatoryStreet.add(archiveLamp)
    const terraceSign = this.createSign('ARCHIVE TERRACE', '#eee8d1', 215, 48)
    terraceSign.scale.set(1.18, 0.29, 1)
    terraceSign.position.set(5.05, observatoryStreetHeight(5.05, -5.9) + 1.12, -5.9)
    this.observatoryStreet.add(terraceSign)
  }

  /** An open westward branch makes Moonhill's first marker a place to walk to. */
  private addMoonhillLensPath(): void {
    const stone = new MeshLambertMaterial({ color: '#9d9a9f', flatShading: true })
    const rail = new MeshLambertMaterial({ color: '#525d75', flatShading: true })
    const brass = new MeshLambertMaterial({ color: '#c3a26a', flatShading: true })
    const path = this.createObservatoryStreetSurface(7.2, 2.2, -4.25, -2.2, '#a49fa2', 0.14)
    this.observatoryStreet.add(path)
    for (let x = -7.5; x <= -1.05; x += 0.54) {
      const slab = new Mesh(new BoxGeometry(0.42, 0.055, 1.88), stone)
      slab.position.set(x, observatoryStreetHeight(x, -2.2) + 0.19, -2.2)
      this.observatoryStreet.add(slab)
    }
    for (const z of [-3.18, -1.22]) {
      for (const x of [-7.2, -5.05, -2.9]) {
        const post = new Mesh(new CylinderGeometry(0.055, 0.07, 0.72, 5), rail)
        post.position.set(x, observatoryStreetHeight(x, z) + 0.36, z)
        this.observatoryStreet.add(post)
        this.addObservatoryStreetBlocker(x, z, 0.18)
      }
      const handrail = new Mesh(new BoxGeometry(6.35, 0.055, 0.055), rail)
      handrail.position.set(-4.05, observatoryStreetHeight(-4.05, z) + 0.67, z)
      this.observatoryStreet.add(handrail)
    }
    const lensDais = new Mesh(new CylinderGeometry(0.77, 0.86, 0.12, 8), brass)
    lensDais.position.set(-5.5, observatoryStreetHeight(-5.5, -2.2) + 0.06, -2.2)
    this.observatoryStreet.add(lensDais)
    for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
      const starStone = new Mesh(new SphereGeometry(0.09, 5, 4), new MeshLambertMaterial({ color: '#e2d7ad', emissive: new Color('#8e7ab3'), emissiveIntensity: 0.35, flatShading: true }))
      starStone.position.set(-5.5 + Math.cos(angle) * 0.47, observatoryStreetHeight(-5.5 + Math.cos(angle) * 0.47, -2.2 + Math.sin(angle) * 0.47) + 0.18, -2.2 + Math.sin(angle) * 0.47)
      this.observatoryStreet.add(starStone)
    }
    const sign = this.createSign('LENS PATH', '#f1ebdc', 185, 48)
    sign.scale.set(1.04, 0.28, 1)
    sign.position.set(-3.05, observatoryStreetHeight(-3.05, -0.95) + 1.03, -0.95)
    this.observatoryStreet.add(sign)
  }

  /**
   * A tiny upland stop gives Moonhill's street district a visible rail-side
   * arrival point. The shelter and parcels are physical, but the track centre
   * is kept clear so the player can cross the terrace rather than being boxed
   * into the observatory road.
   */
  private addMoonhillSignalTerrace(): void {
    const stone = new MeshLambertMaterial({ color: '#a9a4a0', flatShading: true })
    const paleStone = new MeshLambertMaterial({ color: '#d8d3c0', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#665047', flatShading: true })
    const iron = new MeshLambertMaterial({ color: '#454f68', flatShading: true })
    const violet = new MeshLambertMaterial({ color: '#75659a', flatShading: true })

    this.observatoryStreet.add(this.createObservatoryStreetSurface(6.8, 3.65, -5.22, 6.08, '#aaa4a0', 0.13))
    this.observatoryStreet.add(this.createObservatoryStreetSurface(3.35, 1.7, -2.5, 7.12, '#aaa4a0', 0.13))
    for (let x = -8.18; x <= -2.28; x += 0.5) {
      for (const z of [5.35, 6.43]) {
        const slab = new Mesh(new BoxGeometry(0.4, 0.04, 0.76), (Math.round((x - z) * 2) % 2 === 0) ? stone : paleStone)
        slab.position.set(x, observatoryStreetHeight(x, z) + 0.18, z)
        this.observatoryStreet.add(slab)
      }
      const sleeper = new Mesh(new BoxGeometry(0.13, 0.06, 1.56), timber)
      sleeper.position.set(x, observatoryStreetHeight(x, 5.89) + 0.22, 5.89)
      this.observatoryStreet.add(sleeper)
    }
    for (const z of [5.35, 6.43]) {
      const rail = new Mesh(new BoxGeometry(6.15, 0.065, 0.07), iron)
      rail.position.set(-5.25, observatoryStreetHeight(-5.25, z) + 0.28, z)
      this.observatoryStreet.add(rail)
    }

    const shelter = new Group()
    for (const xOffset of [-0.72, 0.72]) {
      const post = new Mesh(new BoxGeometry(0.11, 1.4, 0.11), timber)
      post.position.set(xOffset, 0.7, 0)
      shelter.add(post)
    }
    const canopy = new Mesh(new ConeGeometry(1.18, 0.54, 4), new MeshLambertMaterial({ color: '#3d4867', flatShading: true }))
    canopy.rotation.y = Math.PI / 4
    canopy.position.y = 1.56
    shelter.add(canopy)
    const bench = new Mesh(new BoxGeometry(1.22, 0.14, 0.36), timber)
    bench.position.set(0, 0.47, -0.14)
    shelter.add(bench)
    const shelterSign = this.createSign('SKYRAIL', '#eee9da', 155, 42)
    shelterSign.scale.set(0.86, 0.24, 1)
    shelterSign.position.set(0, 1.44, 0.2)
    shelter.add(shelterSign)
    shelter.position.set(-7.15, observatoryStreetHeight(-7.15, 7.12), 7.12)
    this.observatoryStreet.add(shelter)
    this.addObservatoryStreetBlocker(-7.15, 7.12, 0.92)

    const signal = new Group()
    const pole = new Mesh(new CylinderGeometry(0.07, 0.09, 2.05, 6), iron)
    pole.position.y = 1.02
    signal.add(pole)
    const arm = new Mesh(new BoxGeometry(0.72, 0.09, 0.09), iron)
    arm.position.set(0.3, 1.73, 0)
    arm.rotation.z = -0.26
    signal.add(arm)
    const lens = new Mesh(new SphereGeometry(0.14, 7, 5), new MeshLambertMaterial({ color: '#e5d995', emissive: new Color('#9d7acd'), emissiveIntensity: 0.74, flatShading: true }))
    lens.position.set(0.64, 1.6, 0)
    signal.add(lens)
    signal.position.set(-3.0, observatoryStreetHeight(-3.0, 4.8), 4.8)
    this.observatoryStreet.add(signal)
    this.addObservatoryStreetBlocker(-3.0, 4.8, 0.24)

    const baggage = new Group()
    const trolley = new Mesh(new BoxGeometry(0.98, 0.17, 0.58), iron)
    trolley.position.y = 0.34
    baggage.add(trolley)
    for (const xOffset of [-0.34, 0.34]) {
      const wheel = new Mesh(new TorusGeometry(0.12, 0.035, 5, 8), iron)
      wheel.rotation.y = Math.PI / 2
      wheel.position.set(xOffset, 0.18, -0.23)
      baggage.add(wheel)
    }
    const caseOne = new Mesh(new BoxGeometry(0.4, 0.34, 0.36), violet)
    caseOne.position.set(-0.16, 0.61, 0)
    baggage.add(caseOne)
    const caseTwo = new Mesh(new BoxGeometry(0.31, 0.28, 0.31), new MeshLambertMaterial({ color: '#c19059', flatShading: true }))
    caseTwo.position.set(0.2, 0.54, 0.04)
    baggage.add(caseTwo)
    baggage.position.set(-5.05, observatoryStreetHeight(-5.05, 7.05), 7.05)
    this.observatoryStreet.add(baggage)
    this.addObservatoryStreetBlocker(-5.05, 7.05, 0.72)

    for (const [x, z] of [[-8.45, 5.35], [-8.45, 6.43], [-2.05, 5.35], [-2.05, 6.43]] as Array<[number, number]>) {
      const buffer = new Mesh(new BoxGeometry(0.16, 0.46, 0.22), iron)
      buffer.position.set(x, observatoryStreetHeight(x, z) + 0.23, z)
      this.observatoryStreet.add(buffer)
      this.addObservatoryStreetBlocker(x, z, 0.18)
    }
    const platformSign = this.createSign('SIGNAL TERRACE', '#eee9da', 215, 48)
    platformSign.scale.set(1.18, 0.29, 1)
    platformSign.position.set(-5.28, observatoryStreetHeight(-5.28, 4.5) + 1.14, 4.5)
    this.observatoryStreet.add(platformSign)
  }

  /** Signal Terrace is a through-stop now: its rails visibly curve into the outer hill loop. */
  private addMoonhillSignalTerraceLoopLink(): void {
    const route = new CatmullRomCurve3([
      new Vector3(-8.12, observatoryStreetHeight(-8.12, 5.9) + 0.22, 5.9),
      new Vector3(-8.28, observatoryStreetHeight(-8.28, 7.52) + 0.22, 7.52),
      new Vector3(-8.58, observatoryStreetHeight(-8.58, 9.42) + 0.22, 9.42),
      new Vector3(-9.1, observatoryStreetHeight(-9.1, 11.65) + 0.22, 11.65),
    ], false, 'centripetal')
    this.observatoryStreet.add(new Mesh(new TubeGeometry(route, 38, 0.37, 5, false), new MeshLambertMaterial({ color: '#8e8791', flatShading: true })))
    const iron = new MeshLambertMaterial({ color: '#454f68', flatShading: true })
    for (const offset of [-0.27, 0.27]) {
      const railPoints: Vector3[] = []
      for (let index = 0; index <= 22; index += 1) {
        const progress = index / 22
        const point = route.getPointAt(progress)
        const ahead = route.getPointAt(Math.min(1, progress + 0.02))
        const tangent = ahead.sub(point).normalize()
        railPoints.push(point.add(new Vector3(-tangent.z * offset, 0.03, tangent.x * offset)))
      }
      this.observatoryStreet.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(railPoints, false, 'centripetal'), 38, 0.055, 5, false), iron))
    }
    const timber = new MeshLambertMaterial({ color: '#665047', flatShading: true })
    for (let index = 0; index < 15; index += 1) {
      const progress = index / 15
      const point = route.getPointAt(progress)
      const ahead = route.getPointAt(Math.min(1, progress + 0.02))
      const sleeper = new Mesh(new BoxGeometry(0.98, 0.075, 0.13), timber)
      sleeper.position.copy(point).add(new Vector3(0, -0.055, 0))
      sleeper.rotation.y = Math.atan2(ahead.z - point.z, ahead.x - point.x) + Math.PI / 2
      this.observatoryStreet.add(sleeper)
    }
    const sign = this.createSign('SKYRAIL → LOOP', '#eee9da', 192, 44)
    sign.scale.set(1.02, 0.25, 1)
    sign.position.set(-8.7, observatoryStreetHeight(-8.7, 9.7) + 1.08, 9.7)
    this.observatoryStreet.add(sign)
  }

  /**
   * An eastern counterpart to Signal Terrace gives Moonhill's high road a
   * second destination. The garden is intentionally low and open so its
   * silhouette supports the small-world horizon without obscuring the route.
   */
  private addMoonhillAlmanacGarden(): void {
    this.observatoryStreet.add(this.createObservatoryStreetSurface(7.3, 3.15, 5.25, 7.28, '#aaa49a', 0.14))
    this.observatoryStreet.add(this.createObservatoryStreetSurface(2.15, 2.1, 7.55, 8.88, '#a39e95', 0.15))

    const paleStone = new MeshLambertMaterial({ color: '#d9d3bd', flatShading: true })
    const warmStone = new MeshLambertMaterial({ color: '#9d978b', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#675247', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#414d71', flatShading: true })
    const brass = new MeshLambertMaterial({ color: '#c9a467', emissive: new Color('#705b38'), emissiveIntensity: 0.2, flatShading: true })
    const moss = new MeshLambertMaterial({ color: '#527467', flatShading: true })

    for (let x = 2.05; x <= 8.3; x += 0.54) {
      for (let z = 6.1; z <= 8.5; z += 0.5) {
        const slab = new Mesh(new BoxGeometry(0.44, 0.04, 0.4), (Math.round((x + z) * 2) % 2 === 0) ? paleStone : warmStone)
        slab.position.set(x, observatoryStreetHeight(x, z) + 0.195, z)
        this.observatoryStreet.add(slab)
      }
    }

    const moonDial = new Group()
    const dialBase = new Mesh(new CylinderGeometry(0.8, 0.92, 0.2, 10), paleStone)
    dialBase.position.y = 0.1
    moonDial.add(dialBase)
    const dialFace = new Mesh(new CylinderGeometry(0.62, 0.62, 0.06, 10), new MeshLambertMaterial({ color: '#e4dfc5', flatShading: true }))
    dialFace.position.y = 0.23
    moonDial.add(dialFace)
    const gnomon = new Mesh(new ConeGeometry(0.08, 0.76, 5), brass)
    gnomon.position.set(0, 0.61, 0)
    gnomon.rotation.z = -0.28
    moonDial.add(gnomon)
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const marker = new Mesh(new BoxGeometry(0.09, 0.05, 0.23), brass)
      marker.position.set(Math.sin(angle) * 0.43, 0.29, Math.cos(angle) * 0.43)
      moonDial.add(marker)
    }
    moonDial.position.set(4.4, observatoryStreetHeight(4.4, 7.1), 7.1)
    this.observatoryStreet.add(moonDial)
    this.addObservatoryStreetBlocker(4.4, 7.1, 0.76)

    const pavilion = new Group()
    const body = new Mesh(new BoxGeometry(1.7, 1.28, 1.34), new MeshLambertMaterial({ color: '#657775', flatShading: true }))
    body.position.y = 0.64
    pavilion.add(body)
    const roof = new Mesh(new ConeGeometry(1.2, 0.65, 4), slate)
    roof.rotation.y = Math.PI / 4
    roof.position.y = 1.55
    pavilion.add(roof)
    const openDoor = new Mesh(new PlaneGeometry(0.52, 0.76), new MeshLambertMaterial({ color: '#2f5060', side: DoubleSide }))
    openDoor.position.set(-0.3, 0.42, 0.676)
    pavilion.add(openDoor)
    const weatherVane = new Mesh(new BoxGeometry(0.72, 0.05, 0.08), brass)
    weatherVane.position.set(0, 2.35, 0)
    pavilion.add(weatherVane)
    const vanePost = new Mesh(new CylinderGeometry(0.035, 0.045, 0.92, 5), brass)
    vanePost.position.set(0, 2.0, 0)
    pavilion.add(vanePost)
    const pavilionSign = this.createSign('ALMANAC', '#eee9d6', 145, 42)
    pavilionSign.scale.set(0.82, 0.23, 1)
    pavilionSign.position.set(0.15, 1.53, 0.69)
    pavilion.add(pavilionSign)
    pavilion.position.set(7.45, observatoryStreetHeight(7.45, 8.78), 8.78)
    this.observatoryStreet.add(pavilion)
    this.addObservatoryStreetBlocker(7.45, 8.78, 1.05)

    for (const [x, z, flowerColor] of [[2.55, 8.18, '#8471ad'], [3.45, 8.35, '#d5bc66'], [6.05, 6.3, '#8a78b3']] as Array<[number, number, string]>) {
      const bed = new Group()
      const border = new Mesh(new BoxGeometry(0.88, 0.28, 0.58), timber)
      border.position.y = 0.14
      bed.add(border)
      for (const xOffset of [-0.24, 0, 0.24]) {
        const flower = new Mesh(new SphereGeometry(0.1, 6, 5), new MeshLambertMaterial({ color: flowerColor, emissive: new Color(flowerColor), emissiveIntensity: 0.16, flatShading: true }))
        flower.position.set(xOffset, 0.38, 0)
        bed.add(flower)
      }
      bed.position.set(x, observatoryStreetHeight(x, z), z)
      this.observatoryStreet.add(bed)
      this.addObservatoryStreetBlocker(x, z, 0.56)
    }

    for (const [x, z] of [[2.0, 8.72], [3.55, 8.72], [5.1, 8.72], [6.65, 8.72], [8.2, 8.72]] as Array<[number, number]>) {
      const parapet = new Mesh(new BoxGeometry(0.72, 0.5, 0.26), moss)
      parapet.position.set(x, observatoryStreetHeight(x, z) + 0.25, z)
      this.observatoryStreet.add(parapet)
      this.addObservatoryStreetBlocker(x, z, 0.35)
    }
    for (const [x, z] of [[2.12, 6.25], [6.1, 7.95]] as Array<[number, number]>) {
      const lamp = new Group()
      const post = new Mesh(new CylinderGeometry(0.05, 0.07, 1.58, 6), timber)
      post.position.y = 0.79
      lamp.add(post)
      const glow = new Mesh(new SphereGeometry(0.12, 7, 5), new MeshLambertMaterial({ color: '#f0d575', emissive: new Color('#b77d42'), emissiveIntensity: 0.7, flatShading: true }))
      glow.position.y = 1.54
      lamp.add(glow)
      lamp.position.set(x, observatoryStreetHeight(x, z), z)
      this.observatoryStreet.add(lamp)
    }
    const gardenSign = this.createSign('ALMANAC GARDEN', '#eee9d6', 220, 48)
    gardenSign.scale.set(1.2, 0.28, 1)
    gardenSign.position.set(5.15, observatoryStreetHeight(5.15, 5.85) + 1.15, 5.85)
    this.observatoryStreet.add(gardenSign)
  }

  /**
   * An east-side circuit ties Archive Terrace to Almanac Garden. The centre is
   * left deliberately clear, while the small skyhouse and outer parapet give
   * Moonhill a protected high-road horizon rather than a blank grass edge.
   */
  private addMoonhillCometWalk(): void {
    this.observatoryStreet.add(this.createObservatoryStreetSurface(2.35, 13.65, 10.18, -0.12, '#a49e94', 0.145))
    this.observatoryStreet.add(this.createObservatoryStreetSurface(3.35, 2.0, 8.78, -5.65, '#aaa398', 0.145))
    this.observatoryStreet.add(this.createObservatoryStreetSurface(3.35, 2.0, 8.78, 5.58, '#aaa398', 0.145))

    const paleStone = new MeshLambertMaterial({ color: '#d9d4be', flatShading: true })
    const warmStone = new MeshLambertMaterial({ color: '#9b958c', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#655047', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#3d496d', flatShading: true })
    const brass = new MeshLambertMaterial({ color: '#c9a566', emissive: new Color('#715a39'), emissiveIntensity: 0.2, flatShading: true })
    const moss = new MeshLambertMaterial({ color: '#4f7067', flatShading: true })

    for (let x = 9.2; x <= 11.15; x += 0.48) {
      for (let z = -6.5; z <= 6.2; z += 0.5) {
        const slab = new Mesh(new BoxGeometry(0.4, 0.04, 0.4), (Math.round((x + z) * 2) % 2 === 0) ? paleStone : warmStone)
        slab.position.set(x, observatoryStreetHeight(x, z) + 0.195, z)
        this.observatoryStreet.add(slab)
      }
    }

    const skyhouseX = 12.75
    const skyhouseZ = -0.78
    const skyhouse = new Group()
    const body = new Mesh(new BoxGeometry(1.9, 1.45, 1.48), new MeshLambertMaterial({ color: '#687977', flatShading: true }))
    body.position.y = 0.725
    skyhouse.add(body)
    const roof = new Mesh(new ConeGeometry(1.3, 0.7, 4), slate)
    roof.rotation.y = Math.PI / 4
    roof.position.y = 1.72
    skyhouse.add(roof)
    const door = new Mesh(new PlaneGeometry(0.58, 0.88), new MeshLambertMaterial({ color: '#2d5060', side: DoubleSide }))
    door.position.set(-0.3, 0.47, 0.746)
    skyhouse.add(door)
    const window = new Mesh(new PlaneGeometry(0.42, 0.44), new MeshLambertMaterial({ color: '#d9e6dc', side: DoubleSide }))
    window.position.set(0.43, 0.94, 0.75)
    skyhouse.add(window)
    const sign = this.createSign('SKYHOUSE', '#eee9d8', 158, 42)
    sign.scale.set(0.88, 0.24, 1)
    sign.position.set(0, 1.67, 0.755)
    skyhouse.add(sign)
    const vanePost = new Mesh(new CylinderGeometry(0.035, 0.045, 0.82, 5), brass)
    vanePost.position.set(0.15, 2.38, 0)
    skyhouse.add(vanePost)
    const vane = new Mesh(new BoxGeometry(0.76, 0.045, 0.09), brass)
    vane.position.set(0.15, 2.7, 0)
    vane.rotation.y = -0.32
    skyhouse.add(vane)
    skyhouse.position.set(skyhouseX, observatoryStreetHeight(skyhouseX, skyhouseZ), skyhouseZ)
    this.observatoryStreet.add(skyhouse)
    this.addObservatoryStreetBlocker(skyhouseX, skyhouseZ, 1.14)

    const meteorX = 9.78
    const meteorZ = -2.88
    const meteor = new Group()
    const plinth = new Mesh(new CylinderGeometry(0.42, 0.54, 0.52, 7), warmStone)
    plinth.position.y = 0.26
    meteor.add(plinth)
    const stone = new Mesh(new ConeGeometry(0.34, 0.65, 6), new MeshLambertMaterial({ color: '#6b7085', flatShading: true }))
    stone.rotation.x = Math.PI
    stone.rotation.z = 0.3
    stone.position.y = 0.76
    meteor.add(stone)
    const fleck = new Mesh(new SphereGeometry(0.08, 6, 5), brass)
    fleck.position.set(0.18, 0.91, 0.06)
    meteor.add(fleck)
    meteor.position.set(meteorX, observatoryStreetHeight(meteorX, meteorZ), meteorZ)
    this.observatoryStreet.add(meteor)
    this.addObservatoryStreetBlocker(meteorX, meteorZ, 0.58)

    const bench = new Group()
    const seat = new Mesh(new BoxGeometry(1.18, 0.14, 0.34), timber)
    seat.position.y = 0.42
    bench.add(seat)
    const back = new Mesh(new BoxGeometry(1.18, 0.3, 0.075), timber)
    back.position.set(0, 0.62, 0.13)
    bench.add(back)
    bench.position.set(9.62, observatoryStreetHeight(9.62, 3.2), 3.2)
    bench.rotation.y = -Math.PI / 2
    this.observatoryStreet.add(bench)
    this.addObservatoryStreetBlocker(9.62, 3.2, 0.64)

    for (const z of [-5.95, -3.75, 1.0, 5.22]) {
      const lamp = new Group()
      const post = new Mesh(new CylinderGeometry(0.05, 0.07, 1.58, 6), timber)
      post.position.y = 0.79
      lamp.add(post)
      const glow = new Mesh(new SphereGeometry(0.12, 7, 5), new MeshLambertMaterial({ color: '#f0d575', emissive: new Color('#b77d42'), emissiveIntensity: 0.7, flatShading: true }))
      glow.position.y = 1.54
      lamp.add(glow)
      lamp.position.set(8.92, observatoryStreetHeight(8.92, z), z)
      this.observatoryStreet.add(lamp)
    }

    for (const z of [-5.7, -3.95, -2.2, 0.2, 2.55, 4.82]) {
      const parapet = new Mesh(new BoxGeometry(0.28, 0.5, 0.86), moss)
      parapet.position.set(11.75, observatoryStreetHeight(11.75, z) + 0.25, z)
      this.observatoryStreet.add(parapet)
      this.addObservatoryStreetBlocker(11.75, z, 0.35)
    }
    const outerRail = new Mesh(new BoxGeometry(0.06, 0.06, 11.8), brass)
    outerRail.position.set(11.75, observatoryStreetHeight(11.75, -0.35) + 0.68, -0.35)
    this.observatoryStreet.add(outerRail)

    const walkSign = this.createSign('COMET WALK', '#eee9d8', 182, 46)
    walkSign.scale.set(1.02, 0.27, 1)
    walkSign.position.set(10.18, observatoryStreetHeight(10.18, 5.92) + 1.1, 5.92)
    this.observatoryStreet.add(walkSign)
  }

  /**
   * The spring and high street complete Moonhill's civic circuit. The water
   * remains shallow enough to cross, while stones and a tiny bridge make the
   * intended route clear at a glance on a phone-sized screen.
   */
  private addMoonhillSpringCrossingAndHighStreet(): void {
    const springX = 10.18
    const springZ = 1.62
    this.observatoryStreet.add(this.createObservatoryStreetSurface(5.1, 1.14, springX, springZ, '#5f94a1', 0.105))
    const paleStone = new MeshLambertMaterial({ color: '#d8d3bd', flatShading: true })
    const warmStone = new MeshLambertMaterial({ color: '#9d978b', flatShading: true })
    const timber = new MeshLambertMaterial({ color: '#665047', flatShading: true })
    const slate = new MeshLambertMaterial({ color: '#3d496d', flatShading: true })
    const brass = new MeshLambertMaterial({ color: '#c9a467', emissive: new Color('#705b38'), emissiveIntensity: 0.18, flatShading: true })

    for (let x = springX - 1.95; x <= springX + 1.95; x += 0.55) {
      const stone = new Mesh(new BoxGeometry(0.42, 0.07, 0.7), warmStone)
      stone.position.set(x, observatoryStreetHeight(x, springZ) + 0.22, springZ)
      this.observatoryStreet.add(stone)
    }
    const bridge = new Group()
    const deck = new Mesh(new BoxGeometry(1.12, 0.13, 1.58), paleStone)
    deck.position.y = 0.22
    bridge.add(deck)
    for (const xOffset of [-0.5, 0.5]) {
      for (const zOffset of [-0.56, 0.56]) {
        const post = new Mesh(new CylinderGeometry(0.045, 0.06, 0.72, 5), slate)
        post.position.set(xOffset, 0.48, zOffset)
        bridge.add(post)
      }
      const rail = new Mesh(new BoxGeometry(0.06, 0.06, 1.42), slate)
      rail.position.set(xOffset, 0.72, 0)
      bridge.add(rail)
    }
    bridge.position.set(springX, observatoryStreetHeight(springX, springZ), springZ)
    this.observatoryStreet.add(bridge)
    const springSign = this.createSign('SPRING CROSSING', '#eee9d8', 208, 46)
    springSign.scale.set(1.12, 0.27, 1)
    springSign.position.set(springX, observatoryStreetHeight(springX, springZ + 1.02) + 1.08, springZ + 1.02)
    this.observatoryStreet.add(springSign)

    // A modest public high street makes the east and west hill paths feel
    // inhabited, while its generous paved centre stays clear for touch travel.
    this.observatoryStreet.add(this.createObservatoryStreetSurface(14.0, 2.42, 1.15, 2.25, '#aaa49a', 0.14))
    this.observatoryStreet.add(this.createObservatoryStreetSurface(6.45, 2.8, 2.0, 4.76, '#7f9b79', 0.145))
    for (let x = -5.35; x <= 7.5; x += 0.54) {
      for (const z of [1.45, 2.02, 2.58]) {
        const paver = new Mesh(new BoxGeometry(0.43, 0.04, 0.38), (Math.round((x + z) * 2) % 2 === 0) ? paleStone : warmStone)
        paver.position.set(x, observatoryStreetHeight(x, z) + 0.19, z)
        this.observatoryStreet.add(paver)
      }
    }

    const chartmaker = new Group()
    const body = new Mesh(new BoxGeometry(2.22, 1.58, 1.66), new MeshLambertMaterial({ color: '#69787b', flatShading: true }))
    body.position.y = 0.79
    chartmaker.add(body)
    const roof = new Mesh(new ConeGeometry(1.55, 0.7, 4), slate)
    roof.rotation.y = Math.PI / 4
    roof.position.y = 1.9
    chartmaker.add(roof)
    const door = new Mesh(new PlaneGeometry(0.56, 0.92), new MeshLambertMaterial({ color: '#315663', side: DoubleSide }))
    door.position.set(-0.4, 0.49, 0.836)
    chartmaker.add(door)
    const window = new Mesh(new PlaneGeometry(0.52, 0.5), new MeshLambertMaterial({ color: '#dce8dc', side: DoubleSide }))
    window.position.set(0.48, 1.0, 0.84)
    chartmaker.add(window)
    const chartSign = this.createSign('CHARTMAKER', '#eee9d8', 184, 44)
    chartSign.scale.set(1.0, 0.25, 1)
    chartSign.position.set(0, 1.82, 0.845)
    chartmaker.add(chartSign)
    chartmaker.position.set(-4.75, observatoryStreetHeight(-4.75, 3.72), 3.72)
    this.observatoryStreet.add(chartmaker)
    this.addObservatoryStreetBlocker(-4.75, 3.72, 1.28)

    const teaKiosk = new Group()
    const counter = new Mesh(new BoxGeometry(1.42, 0.78, 0.74), new MeshLambertMaterial({ color: '#876c8c', flatShading: true }))
    counter.position.y = 0.39
    teaKiosk.add(counter)
    for (const xOffset of [-0.55, 0.55]) {
      const post = new Mesh(new BoxGeometry(0.09, 1.5, 0.09), timber)
      post.position.set(xOffset, 0.75, 0)
      teaKiosk.add(post)
    }
    const canopy = new Mesh(new ConeGeometry(1.08, 0.48, 4), new MeshLambertMaterial({ color: '#d5c478', flatShading: true }))
    canopy.rotation.y = Math.PI / 4
    canopy.position.y = 1.55
    teaKiosk.add(canopy)
    const pot = new Mesh(new SphereGeometry(0.16, 7, 5), brass)
    pot.position.set(0.18, 0.88, 0)
    teaKiosk.add(pot)
    const kioskSign = this.createSign('STAR TEA', '#eee9d8', 146, 42)
    kioskSign.scale.set(0.82, 0.23, 1)
    kioskSign.position.set(0, 1.42, 0.42)
    teaKiosk.add(kioskSign)
    teaKiosk.position.set(6.45, observatoryStreetHeight(6.45, 3.86), 3.86)
    this.observatoryStreet.add(teaKiosk)
    this.addObservatoryStreetBlocker(6.45, 3.86, 0.92)

    const greenBench = new Group()
    const seat = new Mesh(new BoxGeometry(1.2, 0.14, 0.34), timber)
    seat.position.y = 0.42
    greenBench.add(seat)
    const back = new Mesh(new BoxGeometry(1.2, 0.3, 0.08), timber)
    back.position.set(0, 0.62, 0.13)
    greenBench.add(back)
    greenBench.position.set(1.05, observatoryStreetHeight(1.05, 4.72), 4.72)
    greenBench.rotation.y = 0.2
    this.observatoryStreet.add(greenBench)
    this.addObservatoryStreetBlocker(1.05, 4.72, 0.66)
    for (const [x, z] of [[-0.55, 5.55], [4.75, 4.55]] as Array<[number, number]>) {
      const flowerBed = new Group()
      const border = new Mesh(new BoxGeometry(0.94, 0.22, 0.62), timber)
      border.position.y = 0.11
      flowerBed.add(border)
      for (const xOffset of [-0.24, 0, 0.24]) {
        const bloom = new Mesh(new SphereGeometry(0.09, 6, 5), new MeshLambertMaterial({ color: x < 1 ? '#8573b5' : '#d2b560', emissive: new Color('#6d5c9f'), emissiveIntensity: 0.12, flatShading: true }))
        bloom.position.set(xOffset, 0.34, 0)
        flowerBed.add(bloom)
      }
      flowerBed.position.set(x, observatoryStreetHeight(x, z), z)
      this.observatoryStreet.add(flowerBed)
      this.addObservatoryStreetBlocker(x, z, 0.56)
    }
    const greenSign = this.createSign('ALMANAC GREEN', '#eee9d8', 205, 46)
    greenSign.scale.set(1.12, 0.27, 1)
    greenSign.position.set(2.15, observatoryStreetHeight(2.15, 5.9) + 1.12, 5.9)
    this.observatoryStreet.add(greenSign)
  }

  /**
   * The observatory story restores a chain of quiet route signals along
   * Comet Walk. They deliberately use emissive materials rather than costly
   * point lights, so the change remains crisp on iPhone-class hardware.
   */
  private addMoonhillSignalLights(): void {
    const iron = new MeshLambertMaterial({ color: '#3f4e69', flatShading: true })
    const brass = new MeshLambertMaterial({ color: '#c8a467', flatShading: true })
    for (const z of [-5.05, -0.2, 4.7]) {
      const signal = new Group()
      const base = new Mesh(new CylinderGeometry(0.18, 0.23, 0.15, 6), brass)
      base.position.y = 0.08
      signal.add(base)
      const post = new Mesh(new CylinderGeometry(0.045, 0.065, 1.28, 6), iron)
      post.position.y = 0.7
      signal.add(post)
      const hood = new Mesh(new ConeGeometry(0.2, 0.22, 6), iron)
      hood.rotation.x = Math.PI / 2
      hood.position.set(0, 1.31, -0.08)
      signal.add(hood)
      const light = new MeshLambertMaterial({ color: '#75699c', emissive: new Color('#41376c'), emissiveIntensity: 0.14, flatShading: true })
      this.observatoryRestorationLights.push(light)
      const lens = new Mesh(new SphereGeometry(0.13, 7, 5), light)
      lens.position.set(0, 1.31, -0.17)
      signal.add(lens)
      signal.position.set(11.12, observatoryStreetHeight(11.12, z), z)
      this.observatoryStreet.add(signal)
      this.addObservatoryStreetBlocker(11.12, z, 0.22)
    }
  }

  /** Moonhill's quiet warden is decorative until the player enters a short talk radius. */
  private addMoonhillWarden(x: number, z: number): void {
    const warden = new Group()
    const cloak = new Mesh(new ConeGeometry(0.43, 1.05, 6), new MeshLambertMaterial({ color: '#65568c', flatShading: true }))
    cloak.position.y = 0.52
    warden.add(cloak)
    const head = new Mesh(new SphereGeometry(0.23, 8, 6), new MeshLambertMaterial({ color: '#d1a084', flatShading: true }))
    head.position.y = 1.14
    warden.add(head)
    const hood = new Mesh(new ConeGeometry(0.31, 0.32, 6), new MeshLambertMaterial({ color: '#3f4c76', flatShading: true }))
    hood.position.y = 1.38
    warden.add(hood)
    const starBook = new Mesh(new BoxGeometry(0.23, 0.32, 0.1), new MeshLambertMaterial({ color: '#d9c77b', flatShading: true }))
    starBook.position.set(0.31, 0.62, 0.2)
    starBook.rotation.z = -0.24
    warden.add(starBook)
    warden.position.set(x, observatoryStreetHeight(x, z), z)
    this.observatoryStreet.add(warden)
    this.addObservatoryStreetBlocker(x, z, 0.38)
  }

  private createObservatoryStreetSurface(width: number, length: number, x: number, z: number, color: string, offset: number): Mesh {
    const geometry = new PlaneGeometry(width, length, Math.max(2, Math.ceil(width)), Math.max(4, Math.ceil(length / 1.5)))
    const positions = geometry.getAttribute('position')
    for (let index = 0; index < positions.count; index += 1) {
      positions.setZ(index, observatoryStreetHeight(x + positions.getX(index), z - positions.getY(index)) + offset)
    }
    geometry.computeVertexNormals()
    geometry.rotateX(-Math.PI / 2)
    const surface = new Mesh(geometry, new MeshLambertMaterial({ color, flatShading: true, side: DoubleSide }))
    surface.position.set(x, 0, z)
    return surface
  }

  private addObservatoryStreetMarker(id: 'observatory-lens' | 'observatory-scope', label: string, requiredStage: 'first' | 'second', x: number, z: number, text: string): void {
    const marker = new Group()
    const violet = new MeshLambertMaterial({ color: '#8d78bf', flatShading: true })
    const base = new Mesh(new CylinderGeometry(0.22, 0.28, 0.36, 5), violet)
    base.position.y = 0.18
    marker.add(base)
    const glow = new Mesh(new SphereGeometry(0.17, 8, 6), new MeshLambertMaterial({ color: '#ede7ff', emissive: new Color('#8d78bf'), emissiveIntensity: 0.9, flatShading: true }))
    glow.position.y = 0.65
    marker.add(glow)
    const sign = this.createSign(label, '#f1ebff', 210, 52)
    sign.scale.set(1.18, 0.3, 1)
    sign.position.y = 1.12
    marker.add(sign)
    const height = observatoryStreetHeight(x, z)
    marker.position.set(x, height, z)
    this.observatoryStreet.add(marker)
    this.observatoryStreetSideMarkers.push({ id, label, sideQuest: 'observatory', requiredStage, district: 'observatory', text, mesh: marker, position: [x, height, z] })
  }

  private addObservatoryStreetBlocker(x: number, z: number, radius: number): void {
    this.observatoryStreetBlockers.push({ center: new Vector3(x, 0, z), radius })
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
    // Keep these intentionally short. Canvas labels do not wrap themselves,
    // so long route names used to clip inside their textures and look like an
    // enormous broken sign when the interior camera arrived.
    const map = this.createSign('SUNSET LOOP  •  ROUTES', '#f8d34e', 620, 125)
    map.position.set(0.7, 3.15, -3.16)
    map.scale.set(3.85, 0.78, 1)
    this.stationInterior.add(map)
    const harbour = this.createSign('HARBOUR  •  LATER', '#dbe9dd', 350, 70)
    harbour.position.set(-1.25, 1.86, -3.14)
    harbour.scale.set(2.15, 0.43, 1)
    this.stationInterior.add(harbour)
    const observatory = this.createSign('MOONHILL  •  LATER', '#dbe9dd', 420, 70)
    observatory.position.set(1.2, 1.17, -3.14)
    observatory.scale.set(2.35, 0.43, 1)
    this.stationInterior.add(observatory)
    const lamp = new Mesh(new SphereGeometry(0.32, 8, 6), new MeshLambertMaterial({ color: '#ffe477', emissive: new Color('#e7a943'), emissiveIntensity: 0.9 }))
    lamp.position.set(3.9, 3.7, -2.6)
    this.stationInterior.add(lamp)
    this.scene.add(this.stationInterior)
  }

  /** A compact travel scene keeps district changes readable as a journey, not a hard cut. */
  private createRailJourneyScene(): void {
    this.journeyScene.visible = false

    const water = new Mesh(new PlaneGeometry(72, 72), new MeshLambertMaterial({ color: '#327e89', flatShading: true }))
    water.rotation.x = -Math.PI / 2
    water.position.y = -0.22
    this.journeyScene.add(water)

    const route = new CatmullRomCurve3([
      new Vector3(-17, 0.18, -11),
      new Vector3(-11, 0.18, -4.4),
      new Vector3(-4.4, 0.18, -0.6),
      new Vector3(2.6, 0.18, 1.1),
      new Vector3(9.6, 0.18, 5.8),
      new Vector3(17, 0.18, 11.5),
    ], false, 'centripetal')
    this.journeyRoute = route

    const ballast = new Mesh(new TubeGeometry(route, 120, 0.42, 5, false), new MeshLambertMaterial({ color: '#465b57', flatShading: true }))
    this.journeyScene.add(ballast)
    for (const offset of [-0.2, 0.2]) {
      const railPoints = Array.from({ length: 60 }, (_, index) => {
        const progress = index / 59
        const point = route.getPointAt(progress)
        const tangent = route.getTangentAt(progress).normalize()
        return point.add(new Vector3(-tangent.z, 0, tangent.x).multiplyScalar(offset))
      })
      this.journeyScene.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(railPoints, false, 'centripetal'), 90, 0.045, 5, false), new MeshLambertMaterial({ color: '#e7d7a2', flatShading: true })))
    }

    const sleeperMaterial = new MeshLambertMaterial({ color: '#765341', flatShading: true })
    const poleMaterial = new MeshLambertMaterial({ color: '#365159', flatShading: true })
    for (let index = 0; index < 24; index += 1) {
      const progress = index / 23
      const point = route.getPointAt(progress)
      const tangent = route.getTangentAt(progress).normalize()
      const sleeper = new Mesh(new BoxGeometry(0.95, 0.1, 0.16), sleeperMaterial)
      sleeper.position.copy(point).setY(0.13)
      sleeper.rotation.y = Math.atan2(tangent.z, tangent.x)
      this.journeyScene.add(sleeper)
      if (index % 3 === 0) {
        const side = new Vector3(-tangent.z, 0, tangent.x).multiplyScalar(index % 2 ? 2.2 : -2.2)
        const pole = new Mesh(new CylinderGeometry(0.06, 0.09, 2.4, 5), poleMaterial)
        pole.position.copy(point).add(side).setY(1.1)
        this.journeyScene.add(pole)
        const wire = new Mesh(new BoxGeometry(2.6, 0.045, 0.045), poleMaterial)
        wire.position.copy(pole.position).setY(2.15)
        wire.rotation.y = Math.atan2(tangent.x, tangent.z)
        this.journeyScene.add(wire)
      }
    }

    const hillsideMaterial = new MeshLambertMaterial({ color: '#6da46c', flatShading: true })
    for (let index = 0; index < 9; index += 1) {
      const hill = new Mesh(new ConeGeometry(2.5 + (index % 3) * 0.45, 3.5 + (index % 2), 6), hillsideMaterial)
      hill.position.set(-13 + index * 3.7, 1.35, index % 2 ? 5.7 : -6.5)
      this.journeyScene.add(hill)
    }

    const carriage = new Mesh(new BoxGeometry(1.28, 0.78, 2.1), new MeshLambertMaterial({ color: '#b94f3d', flatShading: true }))
    carriage.position.y = 0.75
    this.journeyTrain.add(carriage)
    const roof = new Mesh(new BoxGeometry(1.48, 0.16, 2.28), new MeshLambertMaterial({ color: '#243f45', flatShading: true }))
    roof.position.y = 1.2
    this.journeyTrain.add(roof)
    const lampMaterial = new MeshLambertMaterial({ color: '#fff0a3', emissive: new Color('#e5a14a'), emissiveIntensity: 0.8 })
    for (const x of [-0.43, 0.43]) {
      const lamp = new Mesh(new SphereGeometry(0.1, 6, 5), lampMaterial)
      lamp.position.set(x, 0.76, 1.08)
      this.journeyTrain.add(lamp)
    }
    this.journeyScene.add(this.journeyTrain)
    this.scene.add(this.journeyScene)
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
    this.observatoryStreet.visible = false
    this.harbourWorld.visible = false
    this.ambient.visible = false
    this.harbourAmbient.visible = false
    this.root.remove(this.player)
    this.hillsideStreet.remove(this.player)
    this.observatoryStreet.remove(this.player)
    this.harbourWorld.remove(this.player)
    this.harbourStreet.add(this.player)
    this.harbourStreet.visible = true
    this.player.visible = true
    this.save.district = 'harbour'
    if (resetPosition) this.currentNormal.copy(this.normalAt(0.34, -0.3))
    this.restoreStreetPosition(0, 8, resetPosition)
    this.streetForward.set(0, 0, -1)
    this.streetCameraForward.set(0, 0, -1)
    this.streetVelocity.set(0, 0, 0)
    this.entryCameraProgress = 0
    this.updateSideQuestMarkers()
    this.soundscape.setProfile(soundscapeProfile(this.save.quest))
  }

  private showObservatory(resetPosition: boolean): void {
    this.stationInterior.visible = false
    this.inStation = false
    this.root.visible = false
    this.hillsideStreet.visible = false
    this.harbourStreet.visible = false
    this.observatoryStreet.visible = false
    this.ambient.visible = false
    this.harbourWorld.visible = false
    this.harbourAmbient.visible = false
    this.root.remove(this.player)
    this.hillsideStreet.remove(this.player)
    this.harbourStreet.remove(this.player)
    this.harbourWorld.remove(this.player)
    this.observatoryWorld.remove(this.player)
    this.observatoryStreet.add(this.player)
    this.observatoryStreet.visible = true
    this.player.visible = true
    this.save.district = 'observatory'
    if (resetPosition) this.currentNormal.copy(this.normalAt(0.34, -0.3))
    this.restoreStreetPosition(0, 8, resetPosition)
    this.streetForward.set(0, 0, -1)
    this.streetCameraForward.set(0, 0, -1)
    this.streetVelocity.set(0, 0, 0)
    this.entryCameraProgress = 0
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
    const frameSeconds = (now - this.clock.last) / 1000
    const delta = Math.min(frameSeconds, 0.05)
    this.clock.last = now
    this.updateRenderResolution(frameSeconds)
    this.clock.elapsed += delta
    if (this.started) {
      if (this.railJourney) this.updateRailJourney(delta)
      else if (this.inStation) this.updateStation()
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
    if (this.harbourStreet.visible) {
      this.updateHarbourStreetPlayer(delta)
      return
    }
    if (this.observatoryStreet.visible) {
      this.updateObservatoryStreetPlayer(delta)
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

  private updateRailJourney(delta: number): void {
    const journey = this.railJourney
    const route = this.journeyRoute
    if (!journey || !route) return
    journey.elapsed += delta
    const state = createRailJourney(journey.from, journey.to, journey.elapsed, journey.duration)
    if (state.phase === 'atlas' && this.titleRoute) {
      this.journeyScene.visible = false
      this.root.visible = true
      const atlasProgress = railAtlasProgress(journey.from, journey.to, state.progress / ATLAS_JOURNEY_PORTION)
      const localPosition = this.titleRoute.getPointAt(atlasProgress)
      const localAhead = this.titleRoute.getPointAt((atlasProgress + 0.003) % 1)
      this.titleTrain.position.copy(localPosition)
      this.titleTrain.up.copy(localPosition.clone().normalize())
      this.titleTrain.lookAt(localAhead)
      const worldPosition = this.titleAtlas.localToWorld(localPosition.clone())
      const worldNormal = worldPosition.clone().normalize()
      const cameraPosition = worldNormal.multiplyScalar(27).add(new Vector3(0, 5.5, 0))
      this.camera.position.lerp(cameraPosition, 0.1)
      this.camera.up.copy(UP)
      this.camera.lookAt(0, 0.3, 0)
      const percent = Math.round(state.progress * 100)
      if (percent !== this.journeyHudPercent) {
        this.journeyHudPercent = percent
        this.events.onHud(this.currentHud())
      }
      return
    }
    this.root.visible = false
    this.journeyScene.visible = true
    const position = route.getPointAt(state.progress)
    const ahead = route.getPointAt(Math.min(1, state.progress + 0.012))
    const tangent = ahead.clone().sub(position).normalize()
    this.journeyTrain.position.copy(position)
    this.journeyTrain.lookAt(ahead)
    const cameraPosition = position.clone().add(new Vector3(0, 3.2, 0)).addScaledVector(tangent, -5.3)
    this.camera.position.lerp(cameraPosition, 0.1)
    this.camera.up.copy(UP)
    this.camera.lookAt(position.clone().add(new Vector3(0, 0.85, 0)).addScaledVector(tangent, 3.2))
    const percent = Math.round(state.progress * 100)
    if (percent !== this.journeyHudPercent) {
      this.journeyHudPercent = percent
      this.events.onHud(this.currentHud())
    }
    if (state.progress >= 1) this.finishRailJourney()
  }

  private enterHillsideStreet(resetPosition = true): void {
    this.root.visible = false
    this.ambient.visible = false
    this.harbourStreet.visible = false
    this.observatoryStreet.visible = false
    this.hillsideStreet.visible = true
    this.root.remove(this.player)
    this.harbourStreet.remove(this.player)
    this.observatoryStreet.remove(this.player)
    this.hillsideStreet.add(this.player)
    this.player.visible = true
    this.restoreStreetPosition(0, 7.4, resetPosition)
    this.streetForward.set(0, 0, -1)
    this.streetCameraForward.set(0, 0, -1)
    this.streetVelocity.set(0, 0, 0)
    this.entryCameraProgress = 0
  }

  /** Restores only a versioned, validated street coordinate from the active district. */
  private restoreStreetPosition(defaultX: number, defaultZ: number, resetPosition: boolean): void {
    const [savedX, savedZ] = this.save.streetPositions[this.save.district]
    const useSavedPosition = !resetPosition && this.isStreetPositionWalkable(this.save.district, savedX, savedZ)
    this.streetPosition.set(useSavedPosition ? savedX : defaultX, 0, useSavedPosition ? savedZ : defaultZ)
    this.save.streetPosition = [this.streetPosition.x, this.streetPosition.z]
    this.save.streetPositions[this.save.district] = this.save.streetPosition
  }

  /** Reject a stale arrival before it can put the player or follow camera inside scenery. */
  private isStreetPositionWalkable(district: DistrictId, x: number, z: number): boolean {
    const point = new Vector3(x, 0, z)
    if (district === 'hillside') return Math.abs(x) < 18.5 && z < 14.5 && z > -17.55 && isOutsideStreetBlockers(point, this.streetBlockers)
    if (district === 'harbour') return Math.abs(x) < 15.5 && z < 11.5 && z > -10.5 && isOutsideStreetBlockers(point, this.harbourStreetBlockers)
    return Math.abs(x) < 15.5 && z < 11.5 && z > -10.8 && isOutsideStreetBlockers(point, this.observatoryStreetBlockers)
  }

  private updateHillsideStreetPlayer(delta: number): void {
    this.moveStreetPlayer(delta, 4.2, (candidate) => {
      const inBounds = Math.abs(candidate.x) < 18.5 && candidate.z < 14.5 && candidate.z > -17.55
      const clearOfBuildings = isOutsideStreetBlockers(candidate, this.streetBlockers)
      return inBounds && clearOfBuildings
    })
    const playerPosition = this.streetPosition.clone().setY(gentleStreetHeight(this.streetPosition.x, this.streetPosition.z) + 0.04)
    this.player.position.copy(playerPosition)
    this.player.quaternion.identity()
    this.player.rotation.y = Math.atan2(this.streetForward.x, this.streetForward.z)

    const profile = this.nextStreetArrivalProfile(delta, { height: 3.25, followDistance: 5.55, lookAhead: 2.75, lookHeight: 0.85 })
    this.updateStreetCamera(delta, playerPosition, profile)
    this.findNearby(playerPosition)
  }

  private updateHarbourStreetPlayer(delta: number): void {
    this.moveStreetPlayer(delta, 4.1, (candidate) => {
      const inBounds = Math.abs(candidate.x) < 15.5 && candidate.z < 11.5 && candidate.z > -10.5
      return inBounds && isOutsideStreetBlockers(candidate, this.harbourStreetBlockers)
    })
    const playerPosition = this.streetPosition.clone().setY(harbourStreetHeight(this.streetPosition.x, this.streetPosition.z) + 0.04)
    this.player.position.copy(playerPosition)
    this.player.quaternion.identity()
    this.player.rotation.y = Math.atan2(this.streetForward.x, this.streetForward.z)
    const profile = this.nextStreetArrivalProfile(delta, { height: 3.1, followDistance: 5.2, lookAhead: 2.7, lookHeight: 0.84 })
    this.updateStreetCamera(delta, playerPosition, profile)
    this.findNearby(playerPosition)
  }

  private updateObservatoryStreetPlayer(delta: number): void {
    this.moveStreetPlayer(delta, 3.85, (candidate) => {
      const inBounds = Math.abs(candidate.x) < 15.5 && candidate.z < 11.5 && candidate.z > -10.8
      return inBounds && isOutsideStreetBlockers(candidate, this.observatoryStreetBlockers)
    })
    const playerPosition = this.streetPosition.clone().setY(observatoryStreetHeight(this.streetPosition.x, this.streetPosition.z) + 0.04)
    this.player.position.copy(playerPosition)
    this.player.quaternion.identity()
    this.player.rotation.y = Math.atan2(this.streetForward.x, this.streetForward.z)
    const profile = this.nextStreetArrivalProfile(delta, { height: 3.2, followDistance: 5.4, lookAhead: 2.8, lookHeight: 0.88 })
    this.updateStreetCamera(delta, playerPosition, profile)
    this.findNearby(playerPosition)
  }

  /** Small momentum and turn easing keeps direct guidance responsive without snapping the avatar. */
  private moveStreetPlayer(delta: number, speed: number, isWalkable: (candidate: Vector3) => boolean): void {
    const keyboard = new Vector2(
      (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0),
      (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) - (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0),
    )
    const input = this.joystick.lengthSq() > 0.002 ? this.joystick.clone() : keyboard
    const screenDirection = screenRelativeStreetDirection(input, this.streetCameraForward)
    const desiredVelocity = input.lengthSq() > 0.002
      ? new Vector3(screenDirection.x, 0, screenDirection.z).clampLength(0, 1).multiplyScalar(speed)
      : new Vector3()
    const easing = Math.min(1, delta * (desiredVelocity.lengthSq() > 0 ? 8.5 : 12))
    this.streetVelocity.lerp(desiredVelocity, easing)
    if (this.streetVelocity.lengthSq() < 0.0008) {
      this.streetVelocity.set(0, 0, 0)
      return
    }
    const candidate = this.streetPosition.clone().addScaledVector(this.streetVelocity, delta)
    if (!isWalkable(candidate)) {
      this.streetVelocity.set(0, 0, 0)
      return
    }
    this.streetPosition.copy(candidate)
    this.streetForward.lerp(this.streetVelocity.clone().normalize(), Math.min(1, delta * 11)).normalize()
    if (this.clock.elapsed - this.lastStreetSaveTime >= 0.8) {
      this.lastStreetSaveTime = this.clock.elapsed
      this.persist()
    }
  }

  /** A close third-person rig follows heading gently, never the planet's curve. */
  private updateStreetCamera(delta: number, playerPosition: Vector3, profile: StreetCameraProfile): void {
    if (this.streetVelocity.lengthSq() > 0.002) {
      this.streetCameraForward.lerp(this.streetForward, Math.min(1, delta * 3.8)).normalize()
    }
    const cameraPosition = playerPosition.clone()
      .add(new Vector3(0, profile.height, 0))
      .addScaledVector(this.streetCameraForward, -profile.followDistance)
    this.camera.position.lerp(cameraPosition, 0.18)
    this.camera.up.copy(UP)
    this.camera.lookAt(playerPosition.clone()
      .add(new Vector3(0, profile.lookHeight, 0))
      .addScaledVector(this.streetCameraForward, profile.lookAhead))
  }

  private nextStreetArrivalProfile(delta: number, settled: StreetCameraProfile): StreetCameraProfile {
    this.entryCameraProgress = Math.min(1, this.entryCameraProgress + delta / 1.05)
    return streetArrivalProfile(this.entryCameraProgress, settled)
  }

  private updateTitleCamera(): void {
    const angle = animationTime(this.clock.elapsed, this.prefersReducedMotion()) * 0.14
    const compactPhone = this.camera.aspect < 0.82
    // The title is a map-like overview, not the street camera pulled back. A
    // high orbit makes the complete tiny world and its water silhouette visible
    // before the player drops into the local, lower exploration view.
    // Portrait is constrained by width, not height.  A tall narrow viewport
    // needs a much higher orbit to show the entire circular planet rather than
    // cropping its east and west edges.
    const orbitRadius = compactPhone ? 8.4 : 8.2
    const height = compactPhone ? 62 : 29
    this.camera.position.set(Math.cos(angle) * orbitRadius, height + Math.sin(angle * 1.7) * 0.8, Math.sin(angle) * orbitRadius)
    this.camera.up.copy(UP)
    this.camera.lookAt(0, 0.2, 0)
    this.updateTitleTrain()
  }

  private updateTitleTrain(): void {
    if (!this.titleRoute) return
    const progress = this.prefersReducedMotion() ? 0.07 : (this.clock.elapsed * 0.026) % 1
    const position = this.titleRoute.getPointAt(progress)
    const ahead = this.titleRoute.getPointAt((progress + 0.003) % 1)
    this.titleTrain.position.copy(position)
    this.titleTrain.up.copy(position.clone().normalize())
    this.titleTrain.lookAt(ahead)
  }

  private updateStation(): void {
    this.camera.position.set(0, 3.35, 9.5)
    this.camera.up.copy(UP)
    this.camera.lookAt(0, 1.72, -2.75)
    const lamp = this.stationInterior.children.at(-1)
    if (lamp) lamp.position.y = 3.7 + Math.sin(animationTime(this.clock.elapsed, this.prefersReducedMotion()) * 2) * 0.07
  }

  private updateAmbient(): void {
    const motion = animationTime(this.clock.elapsed, this.prefersReducedMotion())
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
    const motion = animationTime(this.clock.elapsed, this.prefersReducedMotion())
    if (this.hillsideStreet.visible) {
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
    if (this.harbourStreet.visible) {
      this.harbourStreetLife.children.forEach((object) => {
        const phase = Number(object.userData.phase ?? 0)
        if (object.userData.kind === 'harbour-gull') {
          const angle = motion * 0.45 + phase
          object.position.set(Math.cos(angle) * 6.2 + 0.4, 4.55 + Math.sin(angle * 2.1) * 0.28, Math.sin(angle) * 3.6 - 6.7)
          object.rotation.y = -angle + Math.PI / 2
          object.rotation.z = Math.sin(motion * 5 + phase) * 0.13
        } else {
          const pulse = 0.82 + (Math.sin(motion * 1.7 + phase) + 1) * 0.28
          object.position.set(-5.6 + Math.cos(phase) * 2.6, 0.035, -13.25 + Math.sin(phase) * 1.7)
          object.scale.setScalar(pulse)
        }
      })
    }
    if (this.observatoryStreet.visible) {
      this.observatoryStreetLife.children.forEach((object) => {
        const phase = Number(object.userData.phase ?? 0)
        if (object.userData.kind === 'moon-firefly') {
          const angle = motion * 0.9 + phase
          const x = -4.9 + Math.cos(angle) * 2.05
          const z = -7.25 + Math.sin(angle * 1.35) * 1.25
          object.position.set(x, observatoryStreetHeight(x, z) + 1.05 + Math.sin(angle * 2.4) * 0.24, z)
        } else {
          const angle = motion * 0.38 + phase
          object.position.set(Math.cos(angle) * 5.4 - 0.9, 4.9 + Math.sin(angle * 2) * 0.24, Math.sin(angle) * 3.4 - 6.4)
          object.rotation.y = -angle + Math.PI / 2
          object.rotation.z = Math.sin(motion * 4.6 + phase) * 0.12
        }
      })
    }
  }

  private findNearby(position: Vector3): void {
    let next: Clue | SideMarker | 'station-keeper' | 'station-door' | 'harbour-keeper' | 'moon-warden' | undefined
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
    if (this.harbourStreet.visible) {
      const keeperPosition = new Vector3(-0.9, harbourStreetHeight(-0.9, -6.35), -6.35)
      if (position.distanceTo(keeperPosition) < 1.85) next = 'harbour-keeper'
    }
    if (this.observatoryStreet.visible) {
      const wardenPosition = new Vector3(-2.55, observatoryStreetHeight(-2.55, -1.5), -1.5)
      if (position.distanceTo(wardenPosition) < 1.85) next = 'moon-warden'
    }
    const activeSideMarkers = this.hillsideStreet.visible
      ? this.streetSideMarkers
      : this.harbourStreet.visible
        ? this.harbourStreetSideMarkers
        : this.observatoryStreet.visible
          ? this.observatoryStreetSideMarkers
          : this.sideMarkers
    for (const marker of activeSideMarkers) {
      if (marker.district !== this.save.district || !marker.mesh.visible) continue
      const markerPosition = new Vector3(...marker.position)
      if (position.distanceTo(markerPosition) < 1.85) next = marker
    }
    const nearbyChanged = next !== this.nearby
    if (nearbyChanged) {
      this.nearby = next
    }
    const nextObjectiveCueKey = this.currentObjectiveCueKey()
    if (nearbyChanged || nextObjectiveCueKey !== this.objectiveCueKey) {
      this.objectiveCueKey = nextObjectiveCueKey
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
    if (isJourneyComplete(this.save.quest)) return '“Every light is on. The Last Loop is complete, and every town has a way home.”'
    if (this.save.quest.stationNameRestored) return '“You did it. The last train has a name to come home to.”'
    return '“The station sign has faded. Find the three amber beacons, and bring our name back.”'
  }

  private harbourKeeperDialogue(): string {
    if (this.save.quest.harbour === 'complete') return '“Hear that? The tide clock is keeping company with every hull in the bay. You set it right.”'
    if (this.save.quest.harbour === 'second') return '“The valve has the water talking again. The dock pump is waiting at the end of the quay.”'
    return '“The tide clock stopped at low water. Tideyard keeps the blue valve; bring its turn back to the dock.”'
  }

  private moonWardenDialogue(): string {
    if (this.save.quest.observatory === 'complete') return '“The signal found the moon. Leave the telescope open; travellers need a bright way home.”'
    if (this.save.quest.observatory === 'second') return '“The lens remembers the sky. Set it into the telescope, and listen for the answering light.”'
    return '“The first clear star fell beside Lens Path. Find it, then the telescope will know where to look.”'
  }

  private emitHud(hint: string, dialogue: string): void {
    this.displayedHint = hint
    this.displayedDialogue = dialogue
    this.objectiveCueKey = this.currentObjectiveCueKey()
    this.events.onHud(this.currentHud())
  }

  private currentHud(): GameHud {
    const journey: RailJourney | undefined = this.railJourney
      ? createRailJourney(this.railJourney.from, this.railJourney.to, this.railJourney.elapsed, this.railJourney.duration)
      : undefined
    const npcName = this.nearby === 'station-keeper' ? 'STATION KEEPER' : this.nearby === 'harbour-keeper' ? 'DOCK KEEPER' : this.nearby === 'moon-warden' ? 'MOONHILL WARDEN' : ''
    const keeperCanBoard = this.nearby === 'station-keeper'
      && this.save.quest.stationNameRestored
      && this.save.quest.lantern === 'complete'
      && this.save.quest.chorus === 'complete'
    const nearbyLabel = keeperCanBoard ? 'Board train' : npcName ? 'Talk' : this.nearby === 'station-door' ? 'Enter station' : typeof this.nearby === 'object' ? `Investigate ${this.nearby.label}` : ''
    const showNpcDialogue = !this.inStation && npcName !== ''
    const npcDialogue = this.nearby === 'station-keeper' ? this.stationKeeperDialogue() : this.nearby === 'harbour-keeper' ? this.harbourKeeperDialogue() : this.nearby === 'moon-warden' ? this.moonWardenDialogue() : ''
    const objective = this.currentObjective()
    return {
      hint: showNpcDialogue ? keeperCanBoard ? 'Tap Board train to open the route map.' : 'Tap Talk to speak.' : this.displayedHint || this.hint(),
      dialogue: showNpcDialogue ? npcDialogue : this.displayedDialogue || this.dialogue(),
      objectiveLabel: objective.label,
      objectiveDirection: objective.direction,
      nearbyLabel: this.inStation || journey ? '' : nearbyLabel,
      showNpcDialogue,
      npcName,
      quest: this.save.quest,
      inStation: this.inStation,
      coatColor: this.save.coatColor,
      district: this.save.district,
      identity: this.save.identity,
      journey,
    }
  }

  /** Finds one visible, nearest step so the town remains discoverable without a minimap. */
  private currentObjective(): { label: string; direction: string } {
    if (!this.started || this.inStation || this.railJourney) return { label: '', direction: '' }
    const candidates: Array<{ label: string; position: [number, number, number] }> = []
    if (this.hillsideStreet.visible) {
      const remainingClues = this.streetClues.filter((clue) => clue.mesh.visible && !this.save.quest.completedClues.includes(clue.id))
      if (remainingClues.length > 0) candidates.push(...remainingClues)
      else {
        candidates.push(...this.streetSideMarkers.filter((marker) => marker.mesh.visible))
        if (candidates.length === 0 && this.save.quest.stationNameRestored) candidates.push({ label: 'Station door', position: [this.streetStationDoorPosition.x, this.streetStationDoorPosition.y, this.streetStationDoorPosition.z] })
      }
    } else if (this.harbourStreet.visible) {
      candidates.push(...this.harbourStreetSideMarkers.filter((marker) => marker.mesh.visible))
    } else if (this.observatoryStreet.visible) {
      candidates.push(...this.observatoryStreetSideMarkers.filter((marker) => marker.mesh.visible))
    }
    if (candidates.length === 0) return { label: '', direction: '' }
    const target = candidates.reduce((nearest, candidate) => {
      const candidateDistance = this.streetPosition.distanceTo(new Vector3(...candidate.position))
      const nearestDistance = this.streetPosition.distanceTo(new Vector3(...nearest.position))
      return candidateDistance < nearestDistance ? candidate : nearest
    })
    return {
      label: `Next: ${target.label}`,
      direction: objectiveDirection(this.streetForward, this.streetPosition, { x: target.position[0], z: target.position[2] }),
    }
  }

  private currentObjectiveCueKey(): string {
    const objective = this.currentObjective()
    return `${objective.label}|${objective.direction}`
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
    this.updateRestorationLighting()
    this.updateSideQuestMarkers()
    this.soundscape.setProfile(soundscapeProfile(this.save.quest))
    this.persist()
    const finished = this.save.quest[marker.sideQuest] === 'complete'
    this.emitHud(marker.text, finished ? marker.sideQuest === 'lantern' ? 'Green Light Home is complete. The signal will guide the last train.' : 'The Morning Chorus is complete. The town has found its song.' : marker.sideQuest === 'lantern' ? 'Take the lens to the teal signal marker.' : 'Take the tune to the rose bell marker.')
  }

  private updateRestorationLighting(): void {
    this.applyRestorationLighting(this.harbourRestorationLights, 'harbour', this.save.quest.harbour)
    this.applyRestorationLighting(this.observatoryRestorationLights, 'observatory', this.save.quest.observatory)
  }

  private applyRestorationLighting(materials: MeshLambertMaterial[], district: RestorationDistrict, stage: SideQuestStage): void {
    const profile = restorationLightProfile(district, stage)
    for (const material of materials) {
      material.color.set(profile.color)
      material.emissive.set(profile.emissive)
      material.emissiveIntensity = profile.intensity
    }
  }

  private updateSideQuestMarkers(): void {
    for (const marker of [...this.sideMarkers, ...this.streetSideMarkers, ...this.harbourStreetSideMarkers, ...this.observatoryStreetSideMarkers]) {
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
    if (this.started && !this.inStation) {
      this.save.streetPosition = [this.streetPosition.x, this.streetPosition.z]
      this.save.streetPositions[this.save.district] = this.save.streetPosition
    }
    if (write) writeSave(window.localStorage, this.save)
  }

  private prefersReducedMotion(): boolean {
    return this.save.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  private updateRenderResolution(frameSeconds: number): void {
    const next = nextRenderResolution({ pixelRatio: this.renderPixelRatio, slowFrames: this.slowFrames, fastFrames: this.fastFrames }, frameSeconds, this.maxPixelRatio)
    this.slowFrames = next.slowFrames
    this.fastFrames = next.fastFrames
    if (next.pixelRatio === this.renderPixelRatio) return
    this.renderPixelRatio = next.pixelRatio
    this.renderer.setPixelRatio(this.renderPixelRatio)
    this.resize()
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
    this.slowFrames = 0
    this.fastFrames = 0
    this.tick()
  }
}
