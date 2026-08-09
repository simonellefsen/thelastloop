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
- ✅ Add conservative adaptive render resolution: sustained slow frames lower internal pixel density on mobile, with gradual recovery when performance allows.
- ✅ Add a persisted in-game reduced-motion control: users can pause decorative title, ambient and station motion independently of their device-wide preference.
- ✅ Replace the fixed phone joystick with direct touch guidance: hold or drag anywhere on the world to guide the character, with an on-screen touch indicator and portrait-safe title framing.
- ✅ Clarify direct touch guidance with an arrow that turns toward the held finger, primary-touch filtering, and safe release when iOS withdraws pointer capture.
- ✅ Polish street movement with analogue touch strength, short acceleration/deceleration, collision-stop behaviour and eased facing, while keeping all characters upright on local terrain.
- ✅ Make local street collision a shared, unit-tested X/Z contract so building, cart and waterfront blockers stay solid across all three districts despite rolling visual terrain.
- ✅ Add a small player-relative route cue that highlights the nearest active marker or station door, updates only on meaningful bearing changes, and never uses a permanent dialogue panel.
- ✅ Add a small original procedural dusk motif to the adaptive soundscape.
- ✅ Turn the title into an interactive showcase of all three playable globe districts.
- ✅ Make the title route selector authoritative: Begin now enters the selected district rather than falling back to the last saved destination.
- ✅ Frame the complete mini-globe at title scale with a high, slow orbit before the street-level entry transition.
- ✅ Make the title globe a single complete route atlas: all three destinations, waystations and natural landmarks remain visible together, with portrait framing sized to the phone's narrow width.
- ✅ Add a continuous title-rail route and a small moving train to connect the globe's settlements visually.
- ✅ Make title route previews useful without isolating the selected district: rotate the complete atlas and light the chosen destination beacon.
- ✅ Harden the iPhone game shell with dynamic viewport sizing, viewport-fit cover and safe-area-aware title/HUD anchors so Safari browser chrome does not crop the play area.
- ✅ Keep the Three.js renderer and camera projection synchronised with iPhone Safari's `visualViewport` as browser chrome expands, collapses or scrolls.
- ✅ Add a street-level entry zoom and a staged world-detail/terrain plan.
- ✅ Make the arrival zoom real in all three local districts: a short elevated camera frame eases into the close, upright exploration view without a loading screen.
- ✅ Replace Hillside gameplay with a gently curved local street district: upright characters/buildings, stable camera, rolling ground, authored roads and building collision.
- ✅ Move Green Light Home and The Morning Chorus into the playable Hillside district, including local visual-state changes.
- ✅ Add the first authored Hillside connection: a step-and-rail route to the bell, road kerbs, retaining edges and planted collision props.
- ✅ Extend the flat local-world treatment to Harbour Works: keep its globe for title preview, then enter an upright dockyard with a physical water edge, warehouse, crane and quest markers.
- ✅ Extend the flat local-world treatment to Moonhill: enter an upright observatory hill with a telescope terrace, stepped rail path, collision-aware dome and trees, and local violet markers.
- Add further authored terrain and collision edges to the three districts.
- ✅ Expand Harbour Works with a collision-aware Outer Pier: planked dock, safety rails, cargo and a beacon tower form a walkable waterfront destination.
- ✅ Connect Harbour Works' first quest marker to the main dock with Tideyard: paved approach, net shed, low rail, cargo and clear wayfinding make the tide valve reachable.
- ✅ Add Harbour Works' Repair Quay: an east dock extension with workshop, hauled boat, lifting gantry, cargo and protected water edge gives the tide-clock route a second collision-aware waterfront pocket.
- ✅ Add Harbour Works' Rail Shed: a compact freight spur, loading shed, hand cart, cargo and lamp make the playable dockyard visibly part of the railway loop.
- ✅ Expand Moonhill with the collision-aware Wind Lookout: shelter, star-chart table, fire bowl, boundary parapet and mossy viewpoint edge.
- ✅ Connect Moonhill's starlight lens to the observatory road with Lens Path: a paved branch, low handrails, sightline-clearing tree move and a small lens dais make the first violet marker clear and reachable.
- ✅ Add Moonhill's Archive Terrace: an eastern observatory branch with a record shelter, brass orrery, chart desk, lamps and collision-aware parapet balances the hilltop with a second detailed destination.
- ✅ Add Moonhill's Signal Terrace: a small upland rail stop with a shelter, signal lens, baggage trolley and collision-aware buffers makes the observatory feel connected to the loop.
- ✅ Complete Ravnbro's bridge route with Reedwater Landing: plank deck, shelter, skiff and a safe physical water edge.
- ✅ Connect Ravnbro's southern route into a River Trade Lane: cobbles, goods hoist, covered stall and edge bollards turn the walk to Reedwater Landing into a continuous town street.
- ✅ Give the two newer districts their own lightweight ambient life: Harbour Works runs dock gulls and water ripples, while Moonhill has swifts and fireflies only while those local worlds are active.
- ✅ Add proximity-only local dialogue in the outer districts: the Dock Keeper and Moonhill Warden explain their current quest step only when approached; neither has a schedule, collision exception or network state.
- ✅ Build the first visible L2 hillside street kit: marked road, kerbs, paths, retaining wall, shop front, benches, lamps and planted boxes.
- ✅ Reframe Hillside as Ravnbro, an original old Danish river-town-inspired rail district: connected frontage groups, timber-and-brick modules, the Market Courtyard and the bell-and-signal landmark.
- ✅ Extend Ravnbro northward with a collision-aware depot quarter: loading canopy, post-and-goods shed, hand cart, cargo and a cobbled yard continue the service lane into a real town edge.
- ✅ Replace the generic Hillside station façade with Ravnbro's original red-brick civic station kit: gable, clock, repeated windows, chimneys and a cobbled forecourt.
- ✅ Replace the remaining generic Hillside buildings with Ravnbro timber-frame frontages, a bakehouse awning, depot yard gate and a walkable service-lane threshold.
- ✅ Add the Reedwater Edge: a bridgelet, reeds, mooring posts, water ripples and a flood marker form the district's collision-aware southern boundary.
- ✅ Build the Market Fold interaction pocket around the mural clue: paved square, original sunset mural, canopy, stalls, crates and bunting.
- ✅ Build Signal Yard around the signal clue: brick hut, yard paving, open fence bay, switch wheel and service crate.
- ✅ Build Bell Rise around the bell clue: paved terrace, original brick bell tower, visible bell and rope, railings and a resting bench.
- ✅ Add Clockmakers' Court: a cobbled market-to-depot cut with a purpose-built repair workshop, workbench, drainage and collision-aware street furniture.
- ✅ Build Station Gate as the railway anchor: platform edge and rails, timetable board, luggage cart, benches and bollards.
- ✅ Turn the station rails into a readable, collision-aware route: timber pedestrian crossing, warning posts and a single open way toward Bell Rise.
- ✅ Add a parked Ravnbro shunter, platform cargo and physical rail-side clearance to complete the first L3 station rail pocket.
- ✅ Add mobile-safe local Ravnbro street life: two decorative walking townsfolk, a small bird flight and butterflies around the planted route.
- ✅ Join Ravnbro's northern authored pockets with North Market Walk: a collision-aware cobbled route, lantern-maker frontage, civic pump, covered parcels and town wayfinding connect the depot yard to Clockmakers' Court.
- ✅ Extend Ravnbro's railway into the depot with a physical Freight Spur: ballast, rails, sleepers, wagon cargo, scales, buffers and a safe pedestrian crossing make North Yard part of the loop.
- ✅ Add Tidehouse Row to Harbour Works: a collision-aware north-west dock branch with a tidehouse, net rack, gauge, barrels, lamps and paving turns its quiet shoulder into a readable local street.
- ✅ Add Moonhill's Almanac Garden: an open collision-aware eastern hill branch with a moon dial, weather pavilion, herb beds, lamps and protected edge balances Signal Terrace across the high road.
- ✅ Add non-blocking, timed district arrival cards so the selected route is legible at street-scale entry without creating a permanent dialogue panel.
- Extend L2/L3 with rail hardware, dense interaction pockets and collision-aware terrain.
- Add recorded ambience and music after an original audio session.

## Later: shared loop

- ✅ Introduce anonymous local passenger identities and an honest solo carriage board.
- ✅ Define and test a versioned WebSocket protocol boundary, without enabling networking.
- Host a persistent WebSocket service outside Vercel and synchronise movement with interpolation.
- Keep quests, NPCs and ambient animation local unless they need shared state.
