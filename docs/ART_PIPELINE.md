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
- Units: **1 unit ≈ 1 metre**; street frontages are two-storey, eaves at **4.58 m**
  (`src/lib/game/kit/scale.ts`)
- **Camera corridor:** streets need at least **4.2 m** of clear paved width
  (`MIN_STREET_CORRIDOR_WIDTH`). The follow rig sits 4.25–4.4 m behind the player
  at ~2.05 m with a 0.42 m probe bundle — a narrower pocket puts flanking eaves
  into the near frustum.
- Origin: **bottom centre** of footprint (Y-up), facing **+Z** as the street façade
- **Characters face +Z too** — the runtime aims a figure with `atan2(dx, dz)`, which points its
  local **+Z** along travel. Blender models drawn facing +Y export to glTF **−Z**, which walks every
  character backwards; `build_character` turns its root 180° before export to correct this. Check
  facing whenever a character kit is re-authored.
- Street frontages must clear the camera: see `src/lib/game/kit/scale.ts` for the eave/camera
  contract, and mirror any change into the exporter's constants.
- **Long roofs:** if street frontage / lot depth is ≥ 1.45, run the ridge along the street
  (`roofRidgesAlongStreet` / Blender `along_x`). A wide span sloping to a short ridge reads as a
  slab from the low camera. Typical houses stay below the ratio and keep a gable to the road.
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
| `harbour-rail-shed` | Rail Shed freight shelter | `buildHarbourRailShed` | `harbour-rail-shed-01.glb` |
| `harbour-freight-cart` | Rail Shed cargo cart | `buildHarbourFreightCart` | `harbour-freight-cart-01.glb` |
| `harbour-pier-beacon` | Outer Pier navigational beacon | `buildHarbourPierBeacon` | `harbour-pier-beacon-01.glb` |
| `harbour-chandlery` | Chandlery Yard shop | `buildHarbourChandlery` | `harbour-chandlery-01.glb` |
| `harbour-sail-rack` | Chandlery Yard sail rack | `buildHarbourSailRack` | `harbour-sail-rack-01.glb` |
| `harbour-capstan` | Chandlery Yard capstan | `buildHarbourCapstan` | `harbour-capstan-01.glb` |
| `moonhill-observatory` | Moonhill dome + study wing | `buildMoonhillObservatory` | `moonhill-observatory-01.glb` |
| `moonhill-telescope` | Quest telescope (runtime lens tint) | `buildMoonhillTelescope` | `moonhill-telescope-01.glb` |
| `moonhill-skyhouse` | Comet Walk lookout | `buildMoonhillSkyhouse` | `moonhill-skyhouse-01.glb` |
| `moonhill-moon-dial` | Almanac Garden landmark | `buildMoonhillMoonDial` | `moonhill-moon-dial-01.glb` |
| `moonhill-almanac-pavilion` | Almanac Garden shelter | `buildMoonhillAlmanacPavilion` | `moonhill-almanac-pavilion-01.glb` |
| `moonhill-star-archive` | Archive Terrace record house | `buildMoonhillStarArchive` | `moonhill-star-archive-01.glb` |
| `moonhill-orrery` | Archive Terrace landmark | `buildMoonhillOrrery` | `moonhill-orrery-01.glb` |
| `moonhill-skyrail-shelter` | Signal Terrace shelter | `buildMoonhillSkyrailShelter` | `moonhill-skyrail-shelter-01.glb` |
| `moonhill-baggage-trolley` | Signal Terrace luggage | `buildMoonhillBaggageTrolley` | `moonhill-baggage-trolley-01.glb` |
| `moonhill-wind-shelter` | Wind Lookout shelter | `buildMoonhillWindShelter` | `moonhill-wind-shelter-01.glb` |
| `moonhill-star-chart-table` | Wind Lookout chart table | `buildMoonhillStarChartTable` | `moonhill-star-chart-table-01.glb` |
| `moonhill-meteor-marker` | Comet Walk landmark | `buildMoonhillMeteorMarker` | `moonhill-meteor-marker-01.glb` |
| `moonhill-chartmaker` | Moonhill high-street map shop | `buildMoonhillChartmaker` | `moonhill-chartmaker-01.glb` |
| `moonhill-star-tea-kiosk` | Moonhill high-street tea kiosk | `buildMoonhillStarTeaKiosk` | `moonhill-star-tea-kiosk-01.glb` |
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

### Profiling on a real iPhone

Append `?perf=1` to show a rendering-cost overlay: fps, ms/frame, draw calls, triangles, and the
live internal pixel ratio against its ceiling. It is gated on the query parameter rather than on a
dev build **on purpose** — a dev bundle is unminified and slower, so only a production build gives
numbers worth acting on. With no parameter the callback is absent and the sampler early-returns, so
it costs nothing.

The pixel-ratio line is the one to watch. `nextRenderResolution` lowers internal density after 45
sustained frames slower than 1/29 s and only recovers after 240 fast ones, so a value below the
ceiling (shown amber) means the device is already missing its budget and the adaptive policy is
compensating.

```bash
pnpm build
```

```bash
pnpm preview --host
```

`--host` is required: Vite binds to localhost only, so without it the phone cannot reach the Mac.
Open `http://<your-lan-ip>:4173/?perf=1` on the device.

**Is it fill-rate or draw calls?** Frame time alone cannot say, and the answer decides whether a
fullscreen post pass (M1.3) is affordable. Add `?dpr=` to force the pixel-density ceiling — it
changes fill cost and nothing else:

- `?perf=1` then `?perf=1&dpr=0.8`, same spot, compare ms/frame.
- **Frame time falls roughly with the pixel count** → fill-rate bound. Spend on resolution and
  shadow-map size; a post pass is expensive here.
- **Frame time barely moves** → CPU/draw-call bound. There is fill headroom, and a post pass is
  comparatively cheap.

**Multisampling.** `?aa=0` creates the context without MSAA. Resolve cost and bandwidth scale with
resolution, so it is a prime suspect on a fill-rate-bound device. At a high pixel ratio the
downsample already softens edges, so the visual loss is far smaller than it would be at 1x.

**Shadow filtering.** `?shadows=soft|pcf|basic|off` swaps the filter. Soft (the default) costs
several shadow-map taps for *every lit screen pixel*, so it scales with resolution rather than with
scene complexity — the first thing to try on a fill-rate-bound device. Note that shadow *map size*
is a fixed per-frame cost and will not show up in a `dpr` comparison.

**Pricing the outlines.** `?outlines=0` hides the inverted-hull shells. They are drawn as inflated
back-face copies of every outlined mesh, so on a fill-bound device they cost overdraw across the
whole silhouette rather than just a draw call each. The gap between `?perf=1` and
`?perf=1&outlines=0` at full density is what M1.4 would hand back — and therefore the budget M1.3's
fullscreen ink pass has to fit inside.

For a deeper look, Safari Web Inspector profiles the phone over USB — enable Web Inspector on the
device (Settings → Apps → Safari → Advanced) and web-developer features on the Mac (Safari →
Settings → Advanced), then Develop → *[device]* → the page. Its **Canvas** tab records WebGL frames
and its **Timelines** tab shows CPU. If CPU looks fine but frames still miss, the bottleneck is fill
rate — reach for pixel ratio and shadow-map size, not draw-call work.

### Verifying from an agent browser pane

An embedded browser pane reports the page as hidden, so `requestAnimationFrame` never
fires: the game cannot be walked, and a screenshot yields roughly one frame per capture.
`tools/browser-driver.js` works around this — paste it into the pane console, take one
screenshot to bootstrap, then drive the loop with `__walk('ArrowUp', 90)` and `__step()`.
It virtualises `performance.now()` because `tick` derives delta from it. Verification aid
only; the app never loads it.

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
| Harbour / Moonhill kit parity | Arrival anchors plus Outer Pier, Tide Yard, Rail Shed, Repair Quay, Chandlery Yard, Wind Lookout, Archive Terrace, Signal Terrace, Comet Walk, Tidehouse Row, Almanac Garden and Moonhill High Street done; remaining street furniture is partial |

When taking over: read this file, then `kit/registry.ts` and `kit/procedural.ts`, then only touch `GameWorld` for placement calls.
