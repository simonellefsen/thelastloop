export type ClueId = 'signal' | 'mural' | 'bell'
export type CoatColor = 'gold' | 'berry' | 'ocean'
export type DistrictId = 'hillside' | 'harbour' | 'observatory'
export type SideQuestId = 'lantern' | 'chorus' | 'harbour' | 'observatory'
export type SideQuestStage = 'locked' | 'first' | 'second' | 'complete'

export interface PassengerIdentity {
  callsign: string
}

export interface RoomDirectoryEntry {
  id: string
  label: string
  occupancy: number
  capacity: number
  localOnly: boolean
}

export interface QuestState {
  introductionSeen: boolean
  completedClues: ClueId[]
  stationNameRestored: boolean
  lantern: SideQuestStage
  chorus: SideQuestStage
  harbour: SideQuestStage
  observatory: SideQuestStage
}

export interface GameSave {
  version: 7
  soundEnabled: boolean
  reducedMotion: boolean
  coatColor: CoatColor
  identity: PassengerIdentity
  district: DistrictId
  playerNormal: [number, number, number]
  /**
   * Compatibility mirror of the active district position. New code uses
   * streetPositions so changing trains can never restore a different town's
   * coordinates into the current scene.
   */
  streetPosition: [number, number]
  /** Last validated local X/Z position for each street district. */
  streetPositions: Record<DistrictId, [number, number]>
  quest: QuestState
}

export interface WorldInteractable {
  id: 'station-keeper' | 'station-door' | 'harbour-keeper' | 'moon-warden' | ClueId | 'lens-cache' | 'signal-repair' | 'tune-card' | 'bell-chime' | 'harbour-valve' | 'harbour-pump' | 'observatory-lens' | 'observatory-scope'
  label: string
  position: [number, number, number]
}

export interface PlayerController {
  setJoystick(input: { x: number; y: number }): void
  interact(): void
  toggleReducedMotion(): void
  leaveStation(): void
  cycleCoat(): void
  cyclePassengerIdentity(): void
  startFresh(): void
  setTitlePreview(district: DistrictId): void
  travelToHarbour(): void
  travelToObservatory(): void
  continueRailLoop(): void
  returnToStation(): void
}

export interface GameHud {
  hint: string
  dialogue: string
  objectiveLabel: string
  objectiveDirection: string
  nearbyLabel: string
  showNpcDialogue: boolean
  npcName: string
  quest: QuestState
  inStation: boolean
  coatColor: CoatColor
  district: DistrictId
  identity: PassengerIdentity
  journey: RailJourney | undefined
}

/** A short, local-only train transfer while the next district scene is prepared. */
export interface RailJourney {
  from: DistrictId
  to: DistrictId
  progress: number
  /** Position on the shared loop during the atlas section of a journey. */
  atlasProgress: number
  label: string
  phase: RailJourneyPhase
}

export type RailJourneyPhase = 'atlas' | 'approach'

/**
 * A rendering-cost snapshot for the `?perf=1` overlay.
 *
 * Deliberately reported from inside the frame loop: `renderer.info` counts are
 * only meaningful per rendered frame, and frame time cannot be sampled from
 * outside. Gated on the query parameter rather than on a dev build, because the
 * numbers worth trusting come from a production bundle on a real phone.
 */
export interface PerfSample {
  fps: number
  msPerFrame: number
  drawCalls: number
  triangles: number
  /** Live internal pixel density, lowered by the adaptive resolution policy. */
  pixelRatio: number
  /** Ceiling the adaptive policy is allowed to recover to. */
  maxPixelRatio: number
}
