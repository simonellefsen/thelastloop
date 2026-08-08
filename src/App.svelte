<script lang="ts">
  import { onMount } from 'svelte'
  import { GameWorld } from './lib/game/GameWorld'
  import type { GameHud, QuestState } from './lib/game/types'
  import { sideQuestLabel } from './lib/game/quest'

  let gameHost: HTMLDivElement
  let game: GameWorld | undefined
  let started = false
  let soundEnabled = true
  let error = ''
  let hud: GameHud = {
    hint: 'Enter the town when you are ready.',
    dialogue: 'A small world remembers every path.',
    nearbyLabel: '',
    quest: { introductionSeen: false, completedClues: [], stationNameRestored: false, lantern: 'locked', chorus: 'locked' },
    inStation: false,
    coatColor: 'gold',
  }

  const clueLabels: Record<string, string> = {
    signal: 'Signal box',
    mural: 'Market mural',
    bell: 'Hill bell',
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

  function joystick(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement
    const bounds = target.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
    const length = Math.hypot(x, y)
    game?.setJoystick({
      x: length > 1 ? x / length : x,
      y: length > 1 ? y / length : y,
    })
  }

  function beginJoystick(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    joystick(event)
  }

  function endJoystick() {
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
  <div class="game-host" bind:this={gameHost} aria-label="The Last Loop 3D game world"></div>

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
      <p class="title-copy">The last train is waiting. Its station has forgotten its name.</p>
      <button class="enter-button" onclick={enterWorld}>Enter the loop</button>
      <p class="title-tip">iPhone landscape · headphones optional</p>
    </section>
  {:else}
    <section class="hud" aria-live="polite">
      <header>
        <div class="wordmark">THE LAST LOOP</div>
        <button class="sound-button" onclick={toggleSound} aria-label={soundEnabled ? 'Mute sound' : 'Enable sound'}>
          {soundEnabled ? '♫' : '×'}
        </button>
      </header>

      {#if !hud.inStation}
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
      {:else}
      <aside class="station-panel">
        <p class="eyebrow">SUNSET LOOP STATION</p>
        <h2>Route map</h2>
        <div class="route-map" aria-label="Future railway destinations">
          <div class="map-loop"></div>
          <span class="map-stop current">Sunset Loop<br /><small>here</small></span>
          <span class="map-stop harbour">Harbour Works<br /><small>coming soon</small></span>
          <span class="map-stop observatory">Moonhill Observatory<br /><small>coming soon</small></span>
        </div>
        <p class="station-copy">The restored line now points towards two places still waiting for their stories.</p>
        <button class="coat-button" onclick={cycleCoat}>Railway coat: {hud.coatColor} ↻</button>
        <button class="leave-button" onclick={leaveStation}>Back to town</button>
      </aside>
      {/if}

      <div class="dialogue" class:complete={isComplete(hud.quest)}>
        <p>{hud.dialogue}</p>
        <small>{hud.hint}</small>
      </div>

      {#if !hud.inStation}<div
        class="joystick"
        role="application"
        aria-label="Movement joystick"
        onpointerdown={beginJoystick}
        onpointermove={joystick}
        onpointerup={endJoystick}
        onpointercancel={endJoystick}
      >
        <div class="joystick-knob"></div>
      </div>{/if}

      {#if !hud.inStation}<button class="interact-button" class:ready={hud.nearbyLabel !== ''} onclick={interact} disabled={hud.nearbyLabel === ''}>
        <span>↗</span>
        {hud.nearbyLabel || 'Explore'}
      </button>
      <p class="controls-tip">Move with the left thumb. Approach glowing markers, then interact.</p>{/if}
    </section>
  {/if}
</main>
