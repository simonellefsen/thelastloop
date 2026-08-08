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

The title remains a spherical overview. On entering Hillside, the game now switches to a distinct, gently curved street district: an upright station town with a shallow rolling ground profile, road, paths, lamps, benches, trees and purpose-built building blockers. The camera and player use world-up rather than a spherical normal, so the player, houses and props remain stable at street scale while the ground still carries a miniature-world rise and fall.

The globe is therefore a macro preview only for Hillside. Its route objects are intentionally not reused as the playable collision layer. Amber clues are placed in the flat district and show an explicit `Investigate …` action when the player enters range.

## Next terrain foundation

1. Give Harbour Works and Moonhill their own named, flat local coordinate frames.
2. Add high-density terrain details to Hillside: slopes, stairs, retaining walls and authored collision edges.
3. ✅ Move existing Hillside side-route props into the playable district: depot lens/signal and tune card/hill bell routes.
4. Extend the authored kerb, retaining-wall, rail, plant and building-front modules into the collision-aware street zone.
5. Transition L0 → L1 → L2 without a loading screen; fade or occlude the macro sphere beyond the local horizon.

This keeps the miniature-world identity at a distance while allowing the close-up feel shown in the reference target: a district is a place to walk through, not a visibly curved ball under the player.
