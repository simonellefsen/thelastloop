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

## Street life

Ravnbro has a small local street-life layer: two non-interactive townsfolk walk short repeating routes, birds circle over the station and butterflies move around planted areas. These are client-side visual behaviours with no profiles, schedules, networking or implied live players. They hold still when reduced motion is enabled.

## Visual rules

- Every model, texture and line of writing is original to this project.
- Small, hand-made-feeling forms: low polygon geometry, warm painted colours, imperfect signs, clear silhouettes.
- Each globe is readable at a glance: rail loop, compact district, visible landmarks, paths and steps.
- The world is small enough to become familiar, never a procedurally generated open world.
- The title opens with the whole mini-globe and its water silhouette in frame; entry then drops into a lower street-level camera. See the [world detail plan](WORLD_DETAIL_PLAN.md) for the local terrain and detail-level path.

### Hillside: Ravnbro, a fictional old river town

Hillside is now art-directed as **Ravnbro**: an original little railway town at the meeting point of a raised rail line, a marshy river edge and a hill. Its architectural reference is the compact urban rhythm of old Danish towns such as Ribe, rather than any copied building, street plan or historical story.

- **Tight, uneven frontage:** narrow gable houses face the lane in short, slightly offset runs; a few have small covered passages leading to private yards.
- **Mixed old materials:** dark timber frames and pale infill, weathered red brick, limewash, green-grey tiled roofs and warm ochre doors. These are shared material families, not replicas of real façades.
- **A town made of thresholds:** raised pavements, short bridgelets, little stairs, handrails, water steps and market pockets should make every route feel deliberately connected.
- **One clear landmark:** a fictional bell-and-signal tower behind the station gives the player a skyline reference from every lane; it is not a model of Ribe Cathedral.
- **Marsh light, not period cosplay:** reeds, reflected water, low mist and lantern warmth suggest a Wadden Sea climate while the railway mystery remains contemporary-fantastical.

### Ravnbro Station façade kit

The station is a small civic anchor rather than a generic house: warm red brick, a long low wing, a taller central gable, slate-grey roof planes, pale repeated windows, modest chimneys, a clock and a cobbled forecourt. This is an original low-poly composition informed by the material hierarchy of historic Danish station buildings; it is not a reconstruction of Ribe Station.

## Controls

- Phone: hold or drag one finger directly on the world and the player follows that screen direction. A small guide ring confirms the current touch; release to stop. The action button appears near a character or clue.
- Desktop: WASD or arrow keys move; use the action button near a marker.
- The camera follows automatically. Portrait and landscape are both supported; landscape gives the wider district view, while portrait frames the complete title globe.
- Focus outlines remain visible for keyboard users. Decorative movement honours the device's reduced-motion preference, and rendering pauses while the page is backgrounded to conserve mobile battery.

## Multiplayer boundary

V1 is fully local. The station offers an anonymous passenger pass (a fixed project callsign, never a name, account or identifier) and an explicitly local-only carriage board. It does not imply live presence or send data anywhere.

A future shared-room release may use these contracts to synchronise avatars, emotes and nearby presence over a separate persistent WebSocket service. Vercel remains the frontend host; game state and ambient life stay client-rendered.
