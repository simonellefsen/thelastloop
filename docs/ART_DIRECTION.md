# Art Direction — The Last Loop

## Goal

Close the gap between a readable prototype world and a **hand-drawn living postcard** — the graphic calm of [Messenger](https://messenger.abeto.com/), with an original **old Danish river-town** soul (Ribe as spatial/material reference, never a copy).

Systems and districts are already strong. Art work should mostly **re-skin and densify** what exists, not invent new towns first.

## Non-negotiables

- Every model, texture and written line is **original** to this project.
- No photoreal photo textures from real places (including `CityImages/`).
- Mobile-first: prefer shared materials, instancing, and cheap outlines over post-processing stacks.
- Decorative motion still honours reduced-motion settings.

## Visual language

| Pillar | Rule |
| --- | --- |
| **Cel surface** | Flat or 2–3 step toon lighting. Soft fill, no hard PBR metal. |
| **Ink silhouette** | Dark outlines on characters and hero architecture. Edges should read like a print. |
| **Limited palette** | Mint air, warm plaster/ochre/brick, terracotta roofs, marsh teal water. Avoid pure black and neon. |
| **Imperfect forms** | Offset gables, uneven timber spans, slightly wonky props — hand-made, not asset-store clean. |
| **Lived-in density** | Bikes, crates, flower boxes, laundry, signs — specific junk, not empty plazas. |
| **Readable people** | Characters need a clear back-view silhouette (hair/hat, coat, bag, legs). |

## Palette (authoritative tokens)

Use `src/lib/game/style.ts` as the code source of truth.

- **Sky / fog:** mint → pale horizon (`#9ed9d4` → `#d8ecd8`), fog matches horizon.
- **Ravnbro walls:** cream, ochre, rose brick, whitewash.
- **Timber:** near-black brown (`#3a2a24`).
- **Roofs:** terracotta family (`#c45c3a`, `#a84a32`); civic green copper only as a rare accent.
- **Ground:** warm cobble and soft grass with blotch, not pure green planes.
- **Water:** marsh teal-green, not pure cyan.

## Architecture (Ravnbro)

Borrow **rhythm**, not façades:

- Continuous frontage on main routes; grass belongs in yards and orchard.
- **Gable roofs**, not default pyramid cones.
- Dark timber grids on pale or brick infill.
- One skyline anchor (bell-and-signal tower) visible down lanes.
- Thresholds: steps, kerbs, bridgelets, covered passages.

Station remains an original civic red-brick kit — informed by Danish station hierarchy, not a reconstruction of Ribe Station.

## Character kit

Player and NPCs share one low-poly language:

- Distinct head + hair/hat
- Coat/torso with readable colour
- Legs/socks/shoes
- Optional sling bag or tool prop
- Soft outline; idle bob only when motion is allowed

## Implementation path

1. ✅ **Surface prototype** — sky/fog, cel materials, outlines, player + keeper, Ravnbro gable/timber kit.
2. ✅ **Painted material kit** — shared low-res illustration textures for grass, cobble, road, plank, plaster, water (`paintedMaterial` / `createPaintTexture` in `style.ts`).
3. ✅ **Prop density (first pass)** — Station Gate → Market Fold clutter; Harbour warehouse + Moonhill dome/telescope/NPCs on the same cel language.
4. ✅ **Kit pipeline (P0–P2)** — `src/lib/game/kit/` with procedural multi-volume modules, glTF drop-in path, hero corridor frontage. See [ART_PIPELINE.md](./ART_PIPELINE.md).
5. **Next** — authored `.glb` for station/houses/characters; denser side pockets; UI calm.

## Out of scope (for now)

- Photoreal materials or real-world photo maps.
- Expensive multi-pass post (SSAO, heavy bloom) on iPhone.
- Copying Messenger assets, glyphs, or characters.

> **Pending amendment.** [MESSENGER_ROADMAP.md](./MESSENGER_ROADMAP.md) M1.3/M1.5 propose a bounded
> two-pass post stack — a depth+normal edge pass and a colour grade — with no blur chain and no
> sampling loops, paid for by deleting the per-mesh inverted-hull draw call it replaces. That is
> cheaper on iPhone than what ships today, but it does conflict with the line above as written.
> Resolve this rule before implementing M1, and keep the SSAO/bloom ban either way.

**In scope for quality leap:** optional Blender `.glb` modules registered in `kit/registry.ts` (see pipeline doc).

## Reference folders

- `Messenger/` — feel, camera, outline density, UI restraint (inspiration only).
- `CityImages/` — Danish street rhythm, roof colour, timber/brick mix (inspiration only).
