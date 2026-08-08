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

The title remains a spherical overview. On entering, the camera now zooms over about one second into a lower, tighter 40-degree street view. This immediately reduces the visible curvature and makes the player and landmarks legible at human scale.

The hillside also now has the first visual L2 kit: a marked station road, kerbs, two pedestrian paths, a retaining wall, bakery frontage, benches, lamps and planted boxes. These pieces are deliberately tangent to their local globe caps, so the player sees street-scale surfaces before the underlying collision terrain is replaced. Buildings use conservative local exclusion zones now; the future terrain mesh will replace these simple circular blockers with authored walls, doors and kerbs.

## Next terrain foundation

1. Give each district a named local coordinate frame anchored to its globe cap.
2. Build a high-density tangent terrain mesh for that frame, including road, pavement, path, slope and stair surfaces.
3. Move player ground following from the broad sphere to the active local mesh; retain the globe only as a macro silhouette.
4. Extend the authored kerb, retaining-wall, rail, plant and building-front modules into the collision-aware street zone.
5. Transition L0 → L1 → L2 without a loading screen; fade or occlude the macro sphere beyond the local horizon.

This keeps the miniature-world identity at a distance while allowing the close-up feel shown in the reference target: a district is a place to walk through, not a visibly curved ball under the player.
