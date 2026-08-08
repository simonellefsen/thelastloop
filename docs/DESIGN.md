# The Last Loop — Design Brief

## Premise

The Last Loop is a gentle, social railway mystery set on a tiny walkable planet. The old circular line is silent and its hillside station has forgotten its name. The player restores a place by walking its paths and noticing the stories held by ordinary objects.

The title screen is also a world showcase: it can switch between the actual 3D hillside, harbour and observatory globes before the story begins. This makes the scope visible immediately without bypassing the hillside narrative.

## V1 story

The station keeper asks the player to find three fragments of the lost name. The signal box remembers **LOOP**, the market mural remembers **SUNSET**, and the hill bell confirms the route. When all three are found, the station sign returns as **SUNSET LOOP**.

Restoring the name opens the station interior. Its route map leads to Harbour Works and Moonhill Observatory, while the player can choose a railway-coat colour.

## Hillside side routes

- **Green Light Home:** recover a brass lens from the depot and fit it to the dark signal. The signal changes from red to green when the route is safe again.
- **The Morning Chorus:** find a tune card in the market and carry it to the hill bell. Completing it wakes a small firefly-and-bird celebration above the town.

## Harbour Works

Harbour Works is a separate compact globe reached from the restored station map. Its rust-red warehouse, dock, crane, fishing boat and tide clock use a cooler industrial palette while retaining the same hand-made, low-poly rules. In **Wake the Tide Clock**, the player finds a blue tide valve and carries it to the dock pump. Repairing it turns the clock green and lets the harbour keep time with the water again.

The route is persisted locally, so reloading while visiting the harbour returns the player to the same district.

## Moonhill Observatory

Moonhill is a twilight-blue observatory globe with a small dome, telescope and floating starlight. In **Align the Moon Signal**, the player finds a starlight lens then brings it to the telescope. The completed scope changes from violet to sea-glass green, restoring a clear night for the railway's distant stations.

## Soundscape

The current soundscape is generated with browser-native Web Audio, not borrowed sound files. A light wind layer starts after the player enters the world; restoring Sunset Loop adds a distant rail hum and an occasional four-note dusk motif; the station interior has a quiet room tone; and completing The Morning Chorus adds occasional soft bird calls. Audio is optional, saved locally, and starts only after an intentional player gesture for iPhone compatibility. Recorded ambience and music remain a separate future audio-session task.

## Visual rules

- Every model, texture and line of writing is original to this project.
- Small, hand-made-feeling forms: low polygon geometry, warm painted colours, imperfect signs, clear silhouettes.
- Each globe is readable at a glance: rail loop, compact district, visible landmarks, paths and steps.
- The world is small enough to become familiar, never a procedurally generated open world.

## Controls

- iPhone landscape: left-thumb joystick moves the player; the right-side action button appears near a character or clue.
- Desktop: WASD or arrow keys move; use the action button near a marker.
- The camera follows automatically. The first release intentionally avoids a second-thumb camera control.
- Focus outlines remain visible for keyboard users. Decorative movement honours the device's reduced-motion preference, and rendering pauses while the page is backgrounded to conserve mobile battery.

## Multiplayer boundary

V1 is fully local. The station offers an anonymous passenger pass (a fixed project callsign, never a name, account or identifier) and an explicitly local-only carriage board. It does not imply live presence or send data anywhere.

A future shared-room release may use these contracts to synchronise avatars, emotes and nearby presence over a separate persistent WebSocket service. Vercel remains the frontend host; game state and ambient life stay client-rendered.
