<script lang="ts">
  import { onMount } from 'svelte'
  import { GameWorld } from './lib/game/GameWorld'
  import { arrivalCopy } from './lib/game/arrival'
  import { guidanceRotation, guideInput } from './lib/game/controls'
  import { HERO_KIT_IDS, kitLoader } from './lib/game/kit'
  import type { DistrictId, GameHud, QuestState } from './lib/game/types'
  import { isJourneyComplete, sideQuestLabel } from './lib/game/quest'

  let gameHost: HTMLDivElement
  let game: GameWorld | undefined
  let started = false
  /** False until kits preload and GameWorld is constructed. */
  let worldReady = false
  /** User hit Begin before the world finished loading. */
  let pendingEnter = false
  let soundEnabled = true
  let reducedMotion = false
  let error = ''
  let guidingPointer: number | undefined
  let guideActive = false
  let guideX = 0
  let guideY = 0
  let guideRotation = 0
  let arrivalDistrict: DistrictId | undefined
  let arrivalNonce = 0
  let arrivalTimer: ReturnType<typeof setTimeout> | undefined
  let titleDistrict: DistrictId = 'hillside'
  let hud: GameHud = {
    hint: 'Enter the town when you are ready.',
    dialogue: 'A small world remembers every path.',
    objectiveLabel: '',
    objectiveDirection: '',
    nearbyLabel: '',
    showNpcDialogue: false,
    npcName: '',
    quest: { introductionSeen: false, completedClues: [], stationNameRestored: false, lantern: 'locked', chorus: 'locked', harbour: 'locked', observatory: 'locked' },
    inStation: false,
    coatColor: 'gold',
    district: 'hillside',
    identity: { callsign: 'EMBER-7' },
    journey: undefined,
  }

  const clueLabels: Record<string, string> = {
    signal: 'Signal box',
    mural: 'Market mural',
    bell: 'Hill bell',
  }

  const titleWorlds: Record<DistrictId, { label: string; copy: string }> = {
    hillside: { label: 'Sunset Loop', copy: 'Hillside paths, the forgotten station, and the first story.' },
    harbour: { label: 'Harbour Works', copy: 'A dockside repair world of cranes, boats, and tide clocks.' },
    observatory: { label: 'Moonhill', copy: 'A twilight observatory world of starlight and a listening telescope.' },
  }

  onMount(() => {
    let disposed = false
    const boot = async () => {
      // The loader is allowed to fail individual files; its synchronous kit
      // fallbacks keep the title playable. Waiting here means a successful
      // preload is actually visible in the very first world construction.
      await kitLoader.preload(HERO_KIT_IDS)
      if (disposed) return
      try {
        game = new GameWorld(gameHost, {
          onHud: (next) => (hud = next),
          onArrival: (district) => showArrival(district),
          onSound: (enabled) => (soundEnabled = enabled),
          onReducedMotion: (enabled) => (reducedMotion = enabled),
          onError: (message) => (error = message),
        })
        soundEnabled = game.getSoundEnabled()
        reducedMotion = game.getReducedMotion()
        worldReady = true
      } catch {
        error = 'This tiny world needs a browser with WebGL support.'
      }
    }
    void boot()

    return () => {
      disposed = true
      if (arrivalTimer) clearTimeout(arrivalTimer)
      game?.dispose()
    }
  })

  function showArrival(district: DistrictId) {
    if (arrivalTimer) clearTimeout(arrivalTimer)
    arrivalDistrict = district
    arrivalNonce += 1
    arrivalTimer = setTimeout(() => {
      arrivalDistrict = undefined
      arrivalTimer = undefined
    }, 3200)
  }

  function enterWorld() {
    if (!game || !worldReady) {
      pendingEnter = true
      return
    }
    beginStory()
  }

  function beginStory() {
    if (!game || started) return
    try {
      // Only set the selected route — never setTitlePreview (that forces the globe on).
      game.setTitleRoute(titleDistrict)
      game.start()
      started = true
      showArrival(titleDistrict)
    } catch (err) {
      console.error('[The Last Loop] failed to enter town', err)
      error = 'Could not enter the town. Try Start fresh, then Begin again.'
      started = false
    }
  }

  function startFresh() {
    if (!window.confirm('Start a fresh loop? This clears story progress, routes, and your last position. Sound, motion, coat, and passenger-pass settings stay yours.')) return
    game?.startFresh()
    window.location.reload()
  }

  function previewWorld(district: DistrictId) {
    titleDistrict = district
    if (!started) game?.setTitlePreview(district)
  }

  function interact() {
    game?.interact()
  }

  function toggleSound() {
    game?.toggleSound()
  }

  function toggleReducedMotion() {
    game?.toggleReducedMotion()
  }

  function leaveStation() {
    game?.leaveStation()
  }

  function cycleCoat() {
    game?.cycleCoat()
  }

  function cyclePassengerIdentity() {
    game?.cyclePassengerIdentity()
  }

  function travelToHarbour() {
    game?.travelToHarbour()
  }

  function travelToObservatory() {
    game?.travelToObservatory()
  }

  function continueRailLoop() {
    game?.continueRailLoop()
  }

  function returnToStation() {
    game?.returnToStation()
  }

  function guidePlayer(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement
    const bounds = target.getBoundingClientRect()
    const input = guideInput(event.clientX, event.clientY, bounds)
    game?.setJoystick(input)
    guideX = event.clientX
    guideY = event.clientY
    guideRotation = guidanceRotation(input)
  }

  function beginGuidance(event: PointerEvent) {
    if (!started || hud.inStation || hud.journey || event.pointerType === 'mouse' || !event.isPrimary) return
    const target = event.currentTarget as HTMLElement
    guidingPointer = event.pointerId
    guideActive = true
    target.setPointerCapture(event.pointerId)
    guidePlayer(event)
  }

  function continueGuidance(event: PointerEvent) {
    if (guidingPointer !== event.pointerId) return
    guidePlayer(event)
  }

  function endGuidance(event: PointerEvent) {
    if (guidingPointer !== event.pointerId) return
    guidingPointer = undefined
    guideActive = false
    guideRotation = 0
    game?.setJoystick({ x: 0, y: 0 })
  }

  function isComplete(quest: QuestState) {
    return quest.stationNameRestored
  }

  function atlasTrainPoint(progress: number) {
    const angle = progress * Math.PI * 2 - Math.PI / 2
    return { x: 90 + Math.cos(angle) * 37, y: 36 + Math.sin(angle) * 25 }
  }
</script>

<!-- PWA / iOS meta tags live in index.html so they are never missing on first paint. -->

<main class:playing={started} class:reduced-motion={reducedMotion}>
  <div
    class="game-host"
    bind:this={gameHost}
    role="application"
    aria-label="The Last Loop 3D game world"
    onpointerdown={beginGuidance}
    onpointermove={continueGuidance}
    onpointerup={endGuidance}
    onpointercancel={endGuidance}
    onlostpointercapture={endGuidance}
  ></div>

  {#if error}
    <section class="unsupported" role="alert">
      <p class="eyebrow">THE LAST LOOP</p>
      <h1>Come back with a newer browser.</h1>
      <p>{error}</p>
    </section>
  {:else if !started}
    <section class="title-screen" aria-label="Start The Last Loop">
      <p class="eyebrow">A TINY RAILWAY WORLD</p>
      <h1><span>THE</span> LAST <span>LOOP</span></h1>
      <p class="title-copy">{titleWorlds[titleDistrict].copy}</p>
      <div class="world-picker" role="group" aria-label="Preview the worlds of The Last Loop">
        {#each (['hillside', 'harbour', 'observatory'] as DistrictId[]) as district}
          <button class:active={titleDistrict === district} onclick={() => previewWorld(district)}>{titleWorlds[district].label}</button>
        {/each}
      </div>
      <button class="enter-button" onclick={enterWorld} disabled={!worldReady}>
        Begin the story
      </button>
      <button class="new-loop-button" onclick={startFresh} disabled={!worldReady}>Start fresh · clear progress</button>
      <p class="title-tip">Choose a route to light its beacon · touch to guide your walk · headphones optional</p>
    </section>
  {:else}
    <section class="hud" aria-live="polite">
      <header>
        <div class="wordmark">THE LAST LOOP</div>
        <div class="header-actions">
          <button class="reset-button" onclick={startFresh} aria-label="Start a fresh loop and clear progress" title="Start a fresh loop">↺</button>
          <button class="motion-button" class:active={reducedMotion} onclick={toggleReducedMotion} aria-label={reducedMotion ? 'Enable ambient motion' : 'Reduce ambient motion'} aria-pressed={reducedMotion}>
            {reducedMotion ? '◌' : '≈'}
          </button>
          <button class="sound-button" onclick={toggleSound} aria-label={soundEnabled ? 'Mute sound' : 'Enable sound'}>
            {soundEnabled ? '♫' : '×'}
          </button>
        </div>
      </header>

      {#if hud.journey}
      {@const trainPoint = atlasTrainPoint(hud.journey.atlasProgress)}
      <section class="journey-card" role="status" aria-live="polite">
        <p class="eyebrow">RIDING {hud.journey.label}</p>
        <h2>{titleWorlds[hud.journey.to].label}</h2>
        <p>{hud.journey.phase === 'atlas' ? 'Following the globe rail' : 'Descending into the next stop'} · {Math.round(hud.journey.progress * 100)}%</p>
        <svg class="journey-route-map" viewBox="0 0 180 72" role="img" aria-label={`The train is travelling from ${titleWorlds[hud.journey.from].label} to ${titleWorlds[hud.journey.to].label} on the globe rail`}>
          <path class="journey-route-line" d="M90 11 C140 11 151 58 90 61 C29 58 40 11 90 11" />
          <circle class:active={hud.journey.from === 'hillside' || hud.journey.to === 'hillside'} class="journey-route-stop" cx="90" cy="11" r="3.5" />
          <circle class:active={hud.journey.from === 'harbour' || hud.journey.to === 'harbour'} class="journey-route-stop" cx="127" cy="36" r="3.5" />
          <circle class:active={hud.journey.from === 'observatory' || hud.journey.to === 'observatory'} class="journey-route-stop" cx="90" cy="61" r="3.5" />
          <text x="90" y="7" text-anchor="middle">RAVNBRO</text>
          <text x="136" y="38.5">HARBOUR</text>
          <text x="90" y="71" text-anchor="middle">MOONHILL</text>
          <circle class="journey-train" cx={trainPoint.x} cy={trainPoint.y} r="4.5" />
          <path class="journey-train-mark" d={`M ${trainPoint.x - 2.1} ${trainPoint.y} L ${trainPoint.x + 1.8} ${trainPoint.y - 2.1} L ${trainPoint.x + 1.8} ${trainPoint.y + 2.1} Z`} />
        </svg>
        <div class="journey-progress" aria-label={`${Math.round(hud.journey.progress * 100)} percent to ${titleWorlds[hud.journey.to].label}`}><span style={`width: ${hud.journey.progress * 100}%`}></span></div>
        <small>The towns are connected by the same little railway.</small>
      </section>
      {:else if !hud.inStation && hud.district === 'hillside'}
      <aside class="quest-card">
        <p class="eyebrow">TONIGHT'S ROUTE</p>
        <h2>{isComplete(hud.quest) ? 'Sunset Loop restored' : 'Find the station name'}</h2>
        <ul>
          {#each ['signal', 'mural', 'bell'] as clue}
            <li class:done={hud.quest.completedClues.includes(clue as 'signal' | 'mural' | 'bell')}>
              <span>{hud.quest.completedClues.includes(clue as 'signal' | 'mural' | 'bell') ? '✓' : '○'}</span>
              {clueLabels[clue]}
            </li>
          {/each}
        </ul>
        {#if isComplete(hud.quest)}
          <div class="side-routes">
            <p class="eyebrow">SIDE ROUTES</p>
            <p class:done={hud.quest.lantern === 'complete'}><span>{hud.quest.lantern === 'complete' ? '✓' : '○'}</span>{sideQuestLabel('lantern', hud.quest.lantern)}</p>
            <p class:done={hud.quest.chorus === 'complete'}><span>{hud.quest.chorus === 'complete' ? '✓' : '○'}</span>{sideQuestLabel('chorus', hud.quest.chorus)}</p>
          </div>
        {/if}
      </aside>
      {:else if !hud.inStation && hud.district === 'harbour'}
      <aside class="quest-card harbour-card">
        <p class="eyebrow">HARBOUR WORKS</p>
        <h2>{hud.quest.harbour === 'complete' ? 'Tide clock restored' : 'Wake the tide clock'}</h2>
        <p class:done={hud.quest.harbour === 'complete'}><span>{hud.quest.harbour === 'complete' ? '✓' : '○'}</span>{sideQuestLabel('harbour', hud.quest.harbour)}</p>
        <button class="loop-button" onclick={continueRailLoop}>Ride onward · Moonhill</button>
        <button class="return-button" onclick={returnToStation}>Return to station</button>
      </aside>
      {:else if !hud.inStation}
      <aside class="quest-card observatory-card">
        <p class="eyebrow">MOONHILL OBSERVATORY</p>
        <h2>{hud.quest.observatory === 'complete' ? 'Moon signal restored' : 'Align the moon signal'}</h2>
        <p class:done={hud.quest.observatory === 'complete'}><span>{hud.quest.observatory === 'complete' ? '✓' : '○'}</span>{sideQuestLabel('observatory', hud.quest.observatory)}</p>
        <button class="loop-button" onclick={continueRailLoop}>Ride onward · Ravnbro</button>
        <button class="return-button" onclick={returnToStation}>Return to station</button>
      </aside>
      {:else}
      <aside class="station-panel">
        <p class="eyebrow">SUNSET LOOP STATION</p>
        {#if isJourneyComplete(hud.quest)}
          <section class="completion-card" aria-live="polite">
            <h2>The Last Loop is complete</h2>
            <p>Ravnbro, Harbour Works and Moonhill are lit again. The last train can find its way home.</p>
            <button class="completion-button" onclick={startFresh}>Begin a fresh loop</button>
          </section>
        {:else}
        <h2>Route map</h2>
        <div class="route-map" aria-label="Railway destinations">
          <div class="map-loop"></div>
          <span class="map-stop current">Sunset Loop<br /><small>here</small></span>
          <button class="map-stop harbour available" onclick={travelToHarbour}>Harbour Works<br /><small>ride now</small></button>
          <button class="map-stop observatory available" onclick={travelToObservatory}>Moonhill Observatory<br /><small>ride now</small></button>
        </div>
        <p class="station-copy">The restored loop now reaches Harbour Works and Moonhill Observatory.</p>
        {/if}
        <div class="carriage-board" aria-label="Local carriage status">
          <strong>{hud.identity.callsign}</strong>
          <span>Quiet carriage · 1 / 6</span>
          <small>Local only — shared rooms are not online yet.</small>
        </div>
        <button class="identity-button" onclick={cyclePassengerIdentity}>Passenger pass: {hud.identity.callsign} ↻</button>
        <button class="coat-button" onclick={cycleCoat}>Railway coat: {hud.coatColor} ↻</button>
        <button class="leave-button" onclick={leaveStation}>Back to town</button>
      </aside>
      {/if}

      {#if hud.showNpcDialogue}
        <div class="dialogue npc-dialogue" class:complete={isComplete(hud.quest)} aria-live="polite">
          <p class="eyebrow">{hud.npcName}</p>
          <p>{hud.dialogue}</p>
          <small>{hud.hint}</small>
        </div>
      {/if}

      {#if arrivalDistrict}
        {#key arrivalNonce}
          <section class="arrival-card" role="status" aria-live="polite">
            <p class="eyebrow">{arrivalCopy[arrivalDistrict].route}</p>
            <h2>{arrivalCopy[arrivalDistrict].place}</h2>
            <p>{arrivalCopy[arrivalDistrict].copy}</p>
          </section>
        {/key}
      {/if}

      {#if !hud.inStation && !hud.journey && guideActive}<div class="touch-guide" style={`left: ${guideX}px; top: ${guideY}px; --guide-turn: ${guideRotation}deg`} aria-hidden="true"><span>↑</span></div>{/if}

      {#if !hud.inStation && !hud.journey && hud.objectiveLabel}
        <p class="objective-cue" aria-label={`${hud.objectiveLabel}, ${hud.objectiveDirection}`}>↗ <strong>{hud.objectiveLabel}</strong><span>{hud.objectiveDirection}</span></p>
      {/if}
      {#if !hud.inStation && !hud.journey}<button class="interact-button" class:ready={hud.nearbyLabel !== ''} onclick={interact} disabled={hud.nearbyLabel === ''}>
        <span>↗</span>
        {hud.nearbyLabel || 'Explore'}
      </button>
      <p class="controls-tip">Hold a finger on the scene to guide your walk. Arrow keys work on desktop.</p>{/if}
    </section>
  {/if}
</main>
