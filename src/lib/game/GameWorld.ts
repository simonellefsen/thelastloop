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
import { isWithinWalkableCap, tangentForward } from './math'
import { defaultQuest, resolveClue } from './quest'
import { readSave, writeSave } from './storage'
import type { ClueId, GameHud, GameSave, PlayerController, QuestState, WorldInteractable } from './types'

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

export class GameWorld implements PlayerController {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(48, 1, 0.1, 120)
  private readonly root = new Group()
  private readonly player = new Group()
  private readonly ground: Mesh
  private readonly raycaster = new Raycaster()
  private readonly clock = { last: performance.now(), elapsed: 0 }
  private readonly keys = new Set<string>()
  private readonly clues: Clue[] = []
  private readonly ambient = new Group()
  private readonly resizeObserver: ResizeObserver
  private readonly onKeyDown = (event: KeyboardEvent) => this.keys.add(event.key.toLowerCase())
  private readonly onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase())
  private readonly onResize = () => this.resize()
  private currentNormal = new Vector3()
  private playerForward = new Vector3(0, 0, -1)
  private joystick = new Vector2()
  private started = false
  private animationFrame = 0
  private nearby: Clue | 'station-keeper' | undefined
  private stationSign: Sprite | undefined
  private save: GameSave
  private audioContext: AudioContext | undefined

  constructor(private readonly container: HTMLElement, private readonly events: GameWorldEvents) {
    this.save = readSave(window.localStorage)
    this.currentNormal.fromArray(this.save.playerNormal).normalize()

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
    this.createAmbientLife()
    this.resize()
    this.resizeObserver = new ResizeObserver(this.onResize)
    this.resizeObserver.observe(container)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.emitHud('Enter the town when you are ready.', 'A small world remembers every path.')
    this.tick()
  }

  getSoundEnabled(): boolean {
    return this.save.soundEnabled
  }

  start(): void {
    this.started = true
    this.save.quest.introductionSeen = true
    this.persist()
    this.emitHud('Find three fragments of the station name.', 'Walk to the glowing amber markers.')
  }

  setJoystick(input: { x: number; y: number }): void {
    this.joystick.set(input.x, input.y)
  }

  interact(): void {
    if (!this.started || !this.nearby) return
    this.playTone(this.nearby === 'station-keeper' ? 392 : 523)
    if (this.nearby === 'station-keeper') {
      this.emitHud('The old sign is blank again. The town kept its name in three little stories.', 'Look for the signal box, market mural and hill bell.')
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
    if (this.save.soundEnabled) this.playTone(660)
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver.disconnect()
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
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
    this.addBuilding(0.38, -0.42, 0.1, '#e7dbbc', '#36565b', 'STATION')
    this.addBuilding(0.52, 0.12, -0.22, '#d8d4c5', '#be7654', 'BAKERY')
    this.addBuilding(0.31, 0.6, 0.45, '#e2c971', '#4e6970', 'HOME')
    this.addBuilding(0.62, -0.86, -0.1, '#c9ded6', '#50666a', 'DEPOT')
    this.addSteps(0.47, 0.42)
    this.addTrees()
    this.addStationKeeper()
    this.addClue('signal', 'Signal box', 0.56, -0.52, 'The brass plate reads: “Every last train returns in a LOOP.”')
    this.addClue('mural', 'Market mural', 0.43, 0.22, 'A faded market mural shows the town under a gold SUNSET.')
    this.addClue('bell', 'Hill bell', 0.27, 0.72, 'The hill bell rings once: the old sign needs the last word—LOOP.')
    this.setStationSign(this.save.quest.stationNameRestored ? 'SUNSET LOOP' : '____ ____', this.save.quest.stationNameRestored ? '#f8d34e' : '#efeee2')
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

  private createPlayer(): void {
    const torso = new Mesh(new CylinderGeometry(0.3, 0.38, 0.85, 6), new MeshLambertMaterial({ color: '#f5be3e', flatShading: true }))
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
    const now = performance.now()
    const delta = Math.min((now - this.clock.last) / 1000, 0.05)
    this.clock.last = now
    this.clock.elapsed += delta
    if (this.started) this.updatePlayer(delta)
    else this.updateTitleCamera()
    this.updateAmbient()
    this.renderer.render(this.scene, this.camera)
    this.animationFrame = requestAnimationFrame(this.tick)
  }

  private updatePlayer(delta: number): void {
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
        const hit = this.raycaster.intersectObject(this.ground, false)[0]
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

    const cameraPosition = playerPosition.clone().addScaledVector(this.currentNormal, 3.8).addScaledVector(facing, -6.7)
    this.camera.position.lerp(cameraPosition, 0.09)
    this.camera.up.copy(this.currentNormal)
    this.camera.lookAt(playerPosition.clone().addScaledVector(facing, 2.1).addScaledVector(this.currentNormal, 0.85))
    this.findNearby(playerPosition)
  }

  private updateTitleCamera(): void {
    const angle = this.clock.elapsed * 0.14
    this.camera.position.set(Math.cos(angle) * 20, 13 + Math.sin(angle * 1.7) * 2, Math.sin(angle) * 20)
    this.camera.up.copy(UP)
    this.camera.lookAt(0, 1.3, 0)
  }

  private updateAmbient(): void {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : this.clock.elapsed
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
  }

  private findNearby(position: Vector3): void {
    let next: Clue | 'station-keeper' | undefined
    const keeperPosition = this.normalAt(0.47, -0.14).multiplyScalar(PLANET_RADIUS)
    if (position.distanceTo(keeperPosition) < 2) next = 'station-keeper'
    for (const clue of this.clues) {
      if (!clue.mesh.visible) continue
      const cluePosition = new Vector3(...clue.position)
      if (position.distanceTo(cluePosition) < 1.85) next = clue
    }
    if (next !== this.nearby) {
      this.nearby = next
      const label = next === 'station-keeper' ? 'Talk' : next?.label ?? ''
      this.events.onHud({ hint: this.hint(), dialogue: this.dialogue(), nearbyLabel: label, quest: this.save.quest })
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
    this.events.onHud({ hint, dialogue, nearbyLabel: this.nearby === 'station-keeper' ? 'Talk' : this.nearby?.label ?? '', quest: this.save.quest })
  }

  private persist(write = true): void {
    this.save.playerNormal = [this.currentNormal.x, this.currentNormal.y, this.currentNormal.z]
    if (write) writeSave(window.localStorage, this.save)
  }

  private playTone(frequency: number): void {
    if (!this.save.soundEnabled) return
    this.audioContext ??= new AudioContext()
    const oscillator = this.audioContext.createOscillator()
    const gain = this.audioContext.createGain()
    oscillator.frequency.value = frequency
    oscillator.type = 'triangle'
    gain.gain.setValueAtTime(0.06, this.audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.28)
    oscillator.connect(gain).connect(this.audioContext.destination)
    oscillator.start()
    oscillator.stop(this.audioContext.currentTime + 0.3)
  }

  private resize(): void {
    const width = Math.max(this.container.clientWidth, 1)
    const height = Math.max(this.container.clientHeight, 1)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }
}
