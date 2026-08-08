# The Last Loop — Design Brief

## Premise

The Last Loop is a gentle, social railway mystery set on a tiny walkable planet. The old circular line is silent and its hillside station has forgotten its name. The player restores a place by walking its paths and noticing the stories held by ordinary objects.

## V1 story

The station keeper asks the player to find three fragments of the lost name. The signal box remembers **LOOP**, the market mural remembers **SUNSET**, and the hill bell confirms the route. When all three are found, the station sign returns as **SUNSET LOOP**.

Restoring the name opens the station interior. Its route map introduces the later Harbour Works and Moonhill Observatory districts, while the player can choose a railway-coat colour. Those destinations remain deliberately unavailable until they have their own stories and worlds.

## Visual rules

- Every model, texture and line of writing is original to this project.
- Small, hand-made-feeling forms: low polygon geometry, warm painted colours, imperfect signs, clear silhouettes.
- The planet is readable at a glance: rail loop, compact hillside district, visible buildings, paths and steps.
- The world is small enough to become familiar, never a procedurally generated open world.

## Controls

- iPhone landscape: left-thumb joystick moves the player; the right-side action button appears near a character or clue.
- Desktop: WASD or arrow keys move; use the action button near a marker.
- The camera follows automatically. The first release intentionally avoids a second-thumb camera control.

## Multiplayer boundary

V1 is fully local. A future shared-room release may synchronise avatars, emotes and nearby presence over a separate persistent WebSocket service. Vercel remains the frontend host; game state and ambient life stay client-rendered.
