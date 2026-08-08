# World Detail Plan

## Intent

The title should read as a small spherical planet. Once the player enters, the camera should settle into a believable street-scale place: pavements, paths, stairs, kerbs, rail edges and rooms should feel locally flat even though the district belongs to a compact globe.

## Detail levels

| Level | Player view | Geometry strategy | Mobile rule |
| --- | --- | --- | --- |
| 0 — globe showcase | Title and route preview | Low-poly sphere, broad district silhouettes, major landmarks | One light, limited particles, no dense props |
| 1 — arrival | The first second after entering a district | Cinematic camera zoom from globe scale to the district cap | Reuse the title meshes; no extra allocation during transition |
| 2 — street zone | Normal exploration | A district-local tangent terrain patch with authored roads, pavements, terraces, stairs and collision/raycast mesh | Detail only within the active district; instance repeated props |
| 3 — interaction pocket | NPCs, signs, doors and clues | Small high-detail prop clusters, decals, rail hardware and local audio emitters | Load/activate only near the player; keep materials shared |

## Current implementation

The title remains a spherical overview. On entering Hillside, the game now switches to a distinct, gently curved street district: an upright station town with a shallow rolling ground profile, road, paths, lamps, benches, trees and purpose-built building blockers. The first local connection is now a visible step-and-rail run toward the hill bell, with kerbed road edges, retaining walls and planted collision props. The camera and player use world-up rather than a spherical normal, so the player, houses and props remain stable at street scale while the ground still carries a miniature-world rise and fall.

The globe is therefore a macro preview only for Hillside. Its route objects are intentionally not reused as the playable collision layer. Amber clues are placed in the flat district and show an explicit `Investigate …` action when the player enters range.

## Ravnbro street plan — reference translated into an original world

Ravnbro is not a recreation of Ribe. It borrows a useful spatial idea from well-preserved Danish river towns: dense, irregular building frontage and many small route decisions make a compact place feel richer than its footprint.

| Pocket | Player purpose | Detail kit | Route connection |
| --- | --- | --- | --- |
| Station Gate | Arrival, keeper, restored name | Station sign, platform edge and rails, crossing, parked shunter, timetable board, luggage cart, benches and bollards | Main street and platform stair |
| Market Fold | Mural clue and tune-card side quest | Paved market square, original sunset mural, canopy, crates, bunting and Market Courtyard | Narrow lane through a covered yard threshold east of the station |
| Signal Yard | Lens route | Brick signal hut, open fence bay, switch wheel, green lamp and service crate | Small service alley behind the northern frontage |
| Bell Rise | Bell clue and step route | Paved terrace, handrails, retaining wall, original bell tower, visible bell and bench | Six-step route from the road, then a sloped back path |
| Reedwater Edge | Quiet atmosphere and future harbour transition | Low bridge, reeds, mooring posts, water shimmer and flood marker | South-west lane, visually below the station town |

The first gameplay pass keeps the present route footprint. It now has the first Ravnbro frontage kit: timber-frame grids on the remaining buildings, a bakehouse awning, depot yard sign and a service-lane threshold. Station Gate now establishes the railway anchor with platform hardware, luggage and waiting props; its rails now have a timber pedestrian crossing, warning lamps and collision outside the clear route toward Bell Rise. A compact parked shunter and platform cargo give that rail edge a readable working purpose while keeping the crossing open. Market Fold now opens through a covered threshold into a cobbled courtyard with a rear brick wing, drainage, laundry and planting; its collision props keep the pocket legible without sealing it off. Signal Yard and Bell Rise make all three main clues clear interaction pockets without obscuring their approaches. Two local townsfolk, a small bird flight and butterflies by the planted route give the district visible life without introducing networking, schedules or persistent NPC state. Future detail should join those short frontage groups into offset runs so that paths naturally reveal courtyards and landmarks. Buildings remain purpose-built abstractions: the reference informs scale, materials and circulation, not individual façades or a real map.

## Next terrain foundation

1. Give Harbour Works and Moonhill their own named, flat local coordinate frames.
2. ✅ Add the first Hillside terrain kit: steps, handrails, kerbs, retaining walls and authored planted collision edges.
3. ✅ Move existing Hillside side-route props into the playable district: depot lens/signal and tune card/hill bell routes.
4. Extend the authored kerb, retaining-wall, rail, plant and building-front modules into the collision-aware street zone.
5. Build the Ravnbro frontage kit: timber-frame beams, brick plinths, tiled gables, covered passages, drainage channels and small yard gates.
6. ✅ Add Reedwater Edge as a collision-aware visual boundary and future route hand-off, without making the opening district materially larger.
7. Transition L0 → L1 → L2 without a loading screen; fade or occlude the macro sphere beyond the local horizon.

This keeps the miniature-world identity at a distance while allowing the close-up feel shown in the reference target: a district is a place to walk through, not a visibly curved ball under the player.
