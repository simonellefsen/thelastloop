# Roadmap

## Released vertical slice

- Rotating mini-globe title scene.
- Curved hillside town with a rail loop, paths, steps and purpose-built low-poly props.
- iPhone landscape controls and desktop keyboard fallback.
- Station-name quest, local save, ambient birds, butterflies, clouds and interaction chimes.

## Next: richer town

- ✅ Add the unlockable station interior, route map and railway-coat customisation.
- ✅ Add two self-contained hillside quests: Green Light Home and The Morning Chorus.
- ✅ Add an original adaptive Web Audio soundscape: wind, a restored rail hum, interior room tone, and chorus chirps.
- ✅ Build Harbour Works as a second compact globe district with a dockside repair story.
- ✅ Build Moonhill Observatory as a third compact globe district with a telescope-alignment story.
- ✅ Harden mobile rendering: background-tab pause, reduced-motion renderer support, and visible keyboard focus.
- ✅ Replace the fixed phone joystick with direct touch guidance: hold or drag anywhere on the world to guide the character, with an on-screen touch indicator and portrait-safe title framing.
- ✅ Add a small original procedural dusk motif to the adaptive soundscape.
- ✅ Turn the title into an interactive showcase of all three playable globe districts.
- ✅ Frame the complete mini-globe at title scale with a high, slow orbit before the street-level entry transition.
- ✅ Make the title globe a single complete route atlas: all three destinations, waystations and natural landmarks remain visible together, with portrait framing sized to the phone's narrow width.
- ✅ Add a continuous title-rail route and a small moving train to connect the globe's settlements visually.
- ✅ Make title route previews useful without isolating the selected district: rotate the complete atlas and light the chosen destination beacon.
- ✅ Add a street-level entry zoom and a staged world-detail/terrain plan.
- ✅ Replace Hillside gameplay with a gently curved local street district: upright characters/buildings, stable camera, rolling ground, authored roads and building collision.
- ✅ Move Green Light Home and The Morning Chorus into the playable Hillside district, including local visual-state changes.
- ✅ Add the first authored Hillside connection: a step-and-rail route to the bell, road kerbs, retaining edges and planted collision props.
- ✅ Extend the flat local-world treatment to Harbour Works: keep its globe for title preview, then enter an upright dockyard with a physical water edge, warehouse, crane and quest markers.
- ✅ Extend the flat local-world treatment to Moonhill: enter an upright observatory hill with a telescope terrace, stepped rail path, collision-aware dome and trees, and local violet markers.
- Add further authored terrain and collision edges to the three districts.
- ✅ Expand Harbour Works with a collision-aware Outer Pier: planked dock, safety rails, cargo and a beacon tower form a walkable waterfront destination.
- ✅ Expand Moonhill with the collision-aware Wind Lookout: shelter, star-chart table, fire bowl, boundary parapet and mossy viewpoint edge.
- ✅ Build the first visible L2 hillside street kit: marked road, kerbs, paths, retaining wall, shop front, benches, lamps and planted boxes.
- ✅ Reframe Hillside as Ravnbro, an original old Danish river-town-inspired rail district: connected frontage groups, timber-and-brick modules, the Market Courtyard and the bell-and-signal landmark.
- ✅ Replace the generic Hillside station façade with Ravnbro's original red-brick civic station kit: gable, clock, repeated windows, chimneys and a cobbled forecourt.
- ✅ Replace the remaining generic Hillside buildings with Ravnbro timber-frame frontages, a bakehouse awning, depot yard gate and a walkable service-lane threshold.
- ✅ Add the Reedwater Edge: a bridgelet, reeds, mooring posts, water ripples and a flood marker form the district's collision-aware southern boundary.
- ✅ Build the Market Fold interaction pocket around the mural clue: paved square, original sunset mural, canopy, stalls, crates and bunting.
- ✅ Build Signal Yard around the signal clue: brick hut, yard paving, open fence bay, switch wheel and service crate.
- ✅ Build Bell Rise around the bell clue: paved terrace, original brick bell tower, visible bell and rope, railings and a resting bench.
- ✅ Build Station Gate as the railway anchor: platform edge and rails, timetable board, luggage cart, benches and bollards.
- ✅ Turn the station rails into a readable, collision-aware route: timber pedestrian crossing, warning posts and a single open way toward Bell Rise.
- ✅ Add a parked Ravnbro shunter, platform cargo and physical rail-side clearance to complete the first L3 station rail pocket.
- ✅ Add mobile-safe local Ravnbro street life: two decorative walking townsfolk, a small bird flight and butterflies around the planted route.
- Extend L2/L3 with rail hardware, dense interaction pockets and collision-aware terrain.
- Add recorded ambience and music after an original audio session.

## Later: shared loop

- ✅ Introduce anonymous local passenger identities and an honest solo carriage board.
- ✅ Define and test a versioned WebSocket protocol boundary, without enabling networking.
- Host a persistent WebSocket service outside Vercel and synchronise movement with interpolation.
- Keep quests, NPCs and ambient animation local unless they need shared state.
