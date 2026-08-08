<script lang="ts">
  import { onMount } from 'svelte'
  import { GameWorld } from './lib/game/GameWorld'
  import { guideInput } from './lib/game/controls'
  import type { DistrictId, GameHud, QuestState } from './lib/game/types'
  import { sideQuestLabel } from './lib/game/quest'

  let gameHost: HTMLDivElement
  let game: GameWorld | undefined
  let started = false
  let soundEnabled = true
  let error = ''
  let guidingPointer: number | undefined
  let guideActive = false
  let guideX = 0
  let guideY = 0
  let titleDistrict: DistrictId = 'hillside'
  let hud: GameHud = {
    hint: 'Enter the town when you are ready.',
    dialogue: 'A small world remembers every path.',
    nearbyLabel: '',
    showNpcDialogue: false,
    quest: { introductionSeen: false, completedClues: [], stationNameRestored: false, lantern: 'locked', chorus: 'locked', harbour: 'locked', observatory: 'locked' },
    inStation: false,
    coatColor: 'gold',
    district: 'hillside',
    identity: { callsign: 'EMBER-7' },
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
    try {
      game = new GameWorld(gameHost, {
        onHud: (next) => (hud = next),
        onSound: (enabled) => (soundEnabled = enabled),
        onError: (message) => (error = message),
      })
      soundEnabled = game.getSoundEnabled()
    } catch {
      error = 'This tiny world needs a browser with WebGL support.'
    }

    return () => game?.dispose()
  })

  function enterWorld() {
    game?.start()
    started = true
  }

  function previewWorld(district: DistrictId) {
    titleDistrict = district
    game?.setTitlePreview(district)
  }

  function interact() {
    game?.interact()
  }

  function toggleSound() {
    game?.toggleSound()
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

  function returnToStation() {
    game?.returnToStation()
  }

  function guidePlayer(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement
    const bounds = target.getBoundingClientRect()
    game?.setJoystick(guideInput(event.clientX, event.clientY, bounds))
    guideX = event.clientX
    guideY = event.clientY
  }

  function beginGuidance(event: PointerEvent) {
    if (!started || hud.inStation || event.pointerType === 'mouse') return
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
    game?.setJoystick({ x: 0, y: 0 })
  }

  function isComplete(quest: QuestState) {
    return quest.stationNameRestored
  }
</script>

<svelte:head>
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</svelte:head>

<main class:playing={started}>
  <div
    class="game-host"
    bind:this={gameHost}
    role="application"
    aria-label="The Last Loop 3D game world"
    onpointerdown={beginGuidance}
    onpointermove={continueGuidance}
    onpointerup={endGuidance}
    onpointercancel={endGuidance}
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
      <button class="enter-button" onclick={enterWorld}>Begin the story</button>
      <p class="title-tip">Choose a route to light its beacon · touch to guide your walk · headphones optional</p>
    </section>
  {:else}
    <section class="hud" aria-live="polite">
      <header>
        <div class="wordmark">THE LAST LOOP</div>
        <button class="sound-button" onclick={toggleSound} aria-label={soundEnabled ? 'Mute sound' : 'Enable sound'}>
          {soundEnabled ? '♫' : '×'}
        </button>
      </header>

      {#if !hud.inStation && hud.district === 'hillside'}
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
        <button class="return-button" onclick={returnToStation}>Return to station</button>
      </aside>
      {:else if !hud.inStation}
      <aside class="quest-card observatory-card">
        <p class="eyebrow">MOONHILL OBSERVATORY</p>
        <h2>{hud.quest.observatory === 'complete' ? 'Moon signal restored' : 'Align the moon signal'}</h2>
        <p class:done={hud.quest.observatory === 'complete'}><span>{hud.quest.observatory === 'complete' ? '✓' : '○'}</span>{sideQuestLabel('observatory', hud.quest.observatory)}</p>
        <button class="return-button" onclick={returnToStation}>Return to station</button>
      </aside>
      {:else}
      <aside class="station-panel">
        <p class="eyebrow">SUNSET LOOP STATION</p>
        <h2>Route map</h2>
        <div class="route-map" aria-label="Railway destinations">
          <div class="map-loop"></div>
          <span class="map-stop current">Sunset Loop<br /><small>here</small></span>
          <button class="map-stop harbour available" onclick={travelToHarbour}>Harbour Works<br /><small>ride now</small></button>
          <button class="map-stop observatory available" onclick={travelToObservatory}>Moonhill Observatory<br /><small>ride now</small></button>
        </div>
        <p class="station-copy">The restored loop now reaches Harbour Works and Moonhill Observatory.</p>
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
          <p class="eyebrow">STATION KEEPER</p>
          <p>{hud.dialogue}</p>
          <small>{hud.hint}</small>
        </div>
      {/if}

      {#if !hud.inStation && guideActive}<div class="touch-guide" style={`left: ${guideX}px; top: ${guideY}px`} aria-hidden="true">↗</div>{/if}

      {#if !hud.inStation}<button class="interact-button" class:ready={hud.nearbyLabel !== ''} onclick={interact} disabled={hud.nearbyLabel === ''}>
        <span>↗</span>
        {hud.nearbyLabel || 'Explore'}
      </button>
      <p class="controls-tip">Hold a finger on the scene to guide your walk. Arrow keys work on desktop.</p>{/if}
    </section>
  {/if}
</main>
