# Art Pipeline — Leaving Lego-land

This document is the **handoff plan** for any agent or artist taking over visual work. It explains why the world still reads as blocky, what “Messenger-adjacent” quality means for this project, and the concrete implementation path.

Related:

- [ART_DIRECTION.md](./ART_DIRECTION.md) — visual language and palette
- [DESIGN.md](./DESIGN.md) — story and gameplay
- [ROADMAP.md](./ROADMAP.md) — shipping checklist

Reference only (do not copy assets): `Messenger/`, `CityImages/`.

---

## Problem statement

**Gameplay and district structure are strong.** Presentation is not.

The current world is mostly runtime primitives (`BoxGeometry`, `ConeGeometry`, `CylinderGeometry`) with cel materials and inverted-hull outlines. That combination improves a good mesh; it cannot turn a single box into a drawn building.

**Definition of done (escape Lego-land):** a cold screenshot of Ravnbro at street camera height, without UI, can sit next to Messenger and a stranger says: *“same kind of game — different place.”*

Checklist:

1. No building is a single unadorned box
2. No tree is a cone on a cylinder
3. Player back-view is readable at a glance
4. Roads/walls have painted variation and ink edges
5. At least one side of the frame has layered depth (stairs / rail / clutter)
6. Sky/fog read as soft paper air

---

## Strategy: hybrid kit (recommended)

Do **not** rewrite the whole planet in Blender at once. Do **not** rely on shaders alone.

```text
Layout + collision + quests  →  stay in code (GameWorld, math blockers)
Visual mesh modules          →  kit system (procedural now, glTF when ready)
Hero corridor first          →  Station Gate → Market Fold (what players see first)
```

### Phases

| Phase | Goal | Owner signals |
| --- | --- | --- |
| **P0 — Pipeline** | Asset registry, glTF load path, procedural fallbacks, hero kit API | Code ships; empty glTF folder is OK |
| **P1 — Hero corridor** | Station + bakery + road props look composed, not Lego | Screenshot test vs Messenger |
| **P2 — Characters** | Player + keeper + 2 walkers as clear silhouettes | Back-view identity |
| **P3 — Authored glTF** | Blender modules drop into `public/assets/gltf/` and replace procedural by id | Same placement API |
| **P4 — District roll-out** | Harbour + Moonhill on same kit language | Per-district passes |
| **P5 — Polish** | Outline weight, color grade, density, audio | Mobile perf budget |

P0–P2 can proceed without Blender. P3 is where a real art pipeline multiplies quality.

---

## Repository layout

```text
docs/
  ART_DIRECTION.md      # look language
  ART_PIPELINE.md       # this file
public/
  assets/
    gltf/               # optional authored meshes (see manifest)
    textures/           # optional painted atlases (future)
    README.md           # artist drop-in notes
src/lib/game/
  style.ts              # palette, cel, paint, outline, gable helper
  kit/
    types.ts            # KitId, placement types
    registry.ts         # id → glTF url + procedural factory
    procedural.ts       # improved code-built modules (fallback)
    loader.ts           # GLTFLoader, cache, clone instances
    character.ts        # shared character figure builders
    trees.ts            # blob crowns, not cones
```

### glTF contract

- Format: **glTF 2.0** (`.glb` preferred for one-file drops)
- Units: **1 unit ≈ 1 metre**; buildings roughly 2.5–4 m tall
- Origin: **bottom centre** of footprint (Y-up), facing **+Z** as the street façade
- Materials: prefer unlit / simple; runtime will re-skin to cel/toon when needed
- Naming: `ravnbro-house-cream-01.glb`, `char-player.glb`, `prop-bike-01.glb`
- License: **original only** (no Marketplace packs, no Messenger rips, no Ribe photo textures)

If a file is missing, `registry.ts` **must** fall back to procedural so the game never breaks.

### Manifest keys (stable IDs)

| KitId | Role | Procedural fallback | Future glTF |
| --- | --- | --- | --- |
| `house-cream` | Gable shop/home | `buildGableHouse` | `ravnbro-house-cream-01.glb` |
| `house-ochre` | Warm frontage | same, ochre wall | `ravnbro-house-ochre-01.glb` |
| `house-brick` | Brick civic/home | rose brick | `ravnbro-house-brick-01.glb` |
| `station-civic` | Ravnbro station | `buildStation` | `ravnbro-station.glb` |
| `bakery` | Bakehouse + awning | `buildBakery` | `ravnbro-bakery.glb` |
| `tree-broad` | Soft crown tree | `buildBroadTree` | `tree-broad-01.glb` |
| `prop-bike` | Street bike | `buildBike` | `prop-bike-01.glb` |
| `prop-planter` | Planted kerb detail | `buildPlanter` | `prop-planter-01.glb` |
| `prop-laundry` | Colourful clothesline | `buildLaundryLine` | `prop-laundry-01.glb` |
| `harbour-warehouse` | Harbour Works arrival frontage | `buildHarbourWarehouse` | `harbour-warehouse-01.glb` |
| `harbour-crane` | Dockyard skyline anchor | `buildHarbourCrane` | `harbour-crane-01.glb` |
| `harbour-repair-workshop` | Repair Quay workshop | `buildHarbourRepairWorkshop` | `harbour-repair-workshop-01.glb` |
| `harbour-repair-boat` | Hauled repair boat | `buildHarbourRepairBoat` | `harbour-repair-boat-01.glb` |
| `harbour-tidehouse` | Tidehouse Row home | `buildHarbourTidehouse` | `harbour-tidehouse-01.glb` |
| `harbour-net-rack` | Net-drying canopy | `buildHarbourNetRack` | `harbour-net-rack-01.glb` |
| `harbour-tide-shed` | Tide Yard net shed | `buildHarbourTideShed` | `harbour-tide-shed-01.glb` |
| `moonhill-observatory` | Moonhill dome + study wing | `buildMoonhillObservatory` | `moonhill-observatory-01.glb` |
| `moonhill-telescope` | Quest telescope (runtime lens tint) | `buildMoonhillTelescope` | `moonhill-telescope-01.glb` |
| `moonhill-skyhouse` | Comet Walk lookout | `buildMoonhillSkyhouse` | `moonhill-skyhouse-01.glb` |
| `moonhill-moon-dial` | Almanac Garden landmark | `buildMoonhillMoonDial` | `moonhill-moon-dial-01.glb` |
| `moonhill-almanac-pavilion` | Almanac Garden shelter | `buildMoonhillAlmanacPavilion` | `moonhill-almanac-pavilion-01.glb` |
| `moonhill-star-archive` | Archive Terrace record house | `buildMoonhillStarArchive` | `moonhill-star-archive-01.glb` |
| `moonhill-orrery` | Archive Terrace landmark | `buildMoonhillOrrery` | `moonhill-orrery-01.glb` |
| `char-player` | Player body | `buildCharacterFigure` | `char-player.glb` |
| `char-npc` | Townsfolk base | `buildCharacterFigure` | `char-npc.glb` |

Agents must **not** rename KitIds without a migration note in this file.

---

## Code integration rules

1. **GameWorld places kits; it does not invent new one-off boxes for hero corridor buildings.**
2. Collision stays in the existing X/Z blocker contract (`addStreetBlocker`, etc.). Visual mesh origin must match blocker centre.
3. Height: always lift with `gentleStreetHeight(x, z)` (or district height fn) after placing the kit root.
4. Outlines: call `addMeshOutline` / `outlineCharacter` on kit roots (or rely on kit builders that already outline).
5. Coat colour: player coat material must remain a shared `MeshToonMaterial` reference so `cycleCoat` keeps working.
6. Mobile: clone instanced roots; do not reload glTF per instance.
7. Reduced motion: no kit may require continuous vertex animation to look complete.

### Async load

`GameWorld` currently builds the world synchronously in the constructor. Pipeline plan:

1. **Now:** procedural kits only (sync).
2. **Next:** preload critical glTF set in `GameWorld` before first frame / during title (`await kitLoader.preload([...])`).
3. Never block interact after play starts; late assets may hot-swap if added later (optional).

---

## Hero corridor scope (P1)

**Walkable path players see first:** Station Gate → main road → bakery / market approach.

Must include:

- Composed station (multi-volume, gable roofs, windows with frames, canopy, chimneys)
- Continuous or near-continuous frontage on at least one road side (offset gables)
- Broad trees (blob crowns), not pine cones on sticks
- Lived-in props (bike, laundry, planters, crates) — already partially present
- Player + keeper with clear back silhouettes

Out of corridor scope for P1: full Reedwater rebuild, Harbour/Moonhill full re-kit (P4).

---

## Blender workflow

### Automated hero kits (current)

Original low-poly modules are authored by script and re-exported with:

```bash
pnpm assets:export
# or:
# /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender/export_ravnbro_kits.py
```

Script: `tools/blender/export_ravnbro_kits.py`  
Output: `public/assets/gltf/*.glb`  
Runtime: `App.svelte` preloads `HERO_KIT_IDS` via `kitLoader` before `GameWorld` starts; materials are re-skinned to cel + outlines on load. The two Blender character kits use named `Coat*`, `Hair*`, `Hat*`, and `Bag*` meshes; the loader reuses the player's shared coat material and applies NPC hat/bag options per clone.

### Manual artist pass (next quality leap)

1. Open an empty scene, unit scale metres, Y-up export for glTF.
2. Model one module at a time against a Messenger *feel* reference (composition, not copy).
3. Keep polycount modest (phone): house module target **~500–2000 tris** unless hero LODs exist.
4. Paint in a limited palette matching `artPalette` in `style.ts`.
5. Export `.glb` → `public/assets/gltf/<name>.glb` (overwrite script output when better).
6. Confirm path in `src/lib/game/kit/registry.ts`.
7. Run `pnpm dev`, stand at Station Gate, screenshot, compare to `Messenger/` feel.
8. If collision wrong, adjust origin or placement offsets in the placement call — do not special-case physics inside the glTF.

---

## What not to do

- Photoreal textures from `CityImages/`
- Random “low poly city” asset packs (wrong style, rights, inconsistency)
- Full post-processing stack (SSAO, heavy bloom) as a substitute for good meshes
- Copying Messenger characters, glyphs, or boats
- Expanding GameWorld with another 2k lines of one-off boxes for hero buildings — use the kit API

---

## Verification for agents

```bash
pnpm test
pnpm check
pnpm build
pnpm dev
```

Manual:

1. Enter Sunset Loop / Ravnbro
2. Stand at station facing the keeper — building should read multi-volume with gables
3. Look at trees — no pure cones
4. Player from behind — hair/coat/bag/legs readable
5. Frame rate acceptable on iPhone Safari (adaptive resolution still active)

---

## Status

| Item | Status |
| --- | --- |
| Art direction contract | Done (`ART_DIRECTION.md`) |
| Cel / outline / paint surfaces | Done (`style.ts`) |
| Prop density first pass | Done (Station → Market) |
| Kit API + procedural modules | Done (`src/lib/game/kit/`) |
| Hero corridor uses kits | Done (station, bakery, depot, home, frontage row, trees, player/NPCs) |
| glTF preload + cel restyle | Done (`App.svelte` + `loader.ts`) |
| Blender-exported hero meshes | Done via `pnpm assets:export` (scripted originals; open for hand polish) |
| Authored Blender character silhouettes | Done (`char-player.glb`, `char-npc.glb`; runtime-tintable) |
| Hand-sculpted Messenger-level art | Next (optional artist pass on the same .glb paths) |
| Harbour / Moonhill kit parity | Arrival anchors plus Tide Yard, Repair Quay, Archive Terrace, Comet Walk, Tidehouse Row and Almanac Garden done; remaining street furniture is partial |

When taking over: read this file, then `kit/registry.ts` and `kit/procedural.ts`, then only touch `GameWorld` for placement calls.
