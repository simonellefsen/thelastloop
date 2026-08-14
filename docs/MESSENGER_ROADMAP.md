# Messenger Parity Roadmap

**Goal:** a cold screenshot of Ravnbro at street height, UI hidden, can sit beside a
[Messenger](https://messenger.abeto.com/) screenshot and a stranger says *"same kind of game,
different place."*

That target is already written in [ART_PIPELINE.md](./ART_PIPELINE.md). This document exists because
we are not passing it yet, and because the reason is now measurable rather than a matter of taste.

Reference only, never copied: `Messenger/` (18 screenshots, a 56s portrait phone capture, and a 34s
4096×2334 desktop capture — the desktop one is the camera reference for M0 and M2), `CityImages/`.

---

## 1. Where we actually are

Measured 2026-08-11 against `main`, running the live build at `localhost:5174`.

**Systems are done.** Three districts, quests, the shared global rail backbone, rideable transfers,
versioned saves, touch guidance, adaptive resolution, viewport hardening, adaptive audio. 15 test
files / 70 tests pass. None of that is the problem.

**The art pipeline is also done** — and that is the surprising part. `kit/registry.ts`,
`kit/loader.ts`, the glTF drop-in path, cel materials, painted textures and
`tools/blender/export_ravnbro_kits.py` all work. 40 `.glb` files ship and load.

**What has not happened is the art.** The pipeline is currently transporting the same Lego geometry
it was built to replace:

| Claim | Evidence |
| --- | --- |
| Blender kits are primitives only | `export_ravnbro_kits.py` defines `box()`, `cylinder()`, `sphere()`, `plane()`, `gable_roof()`. Zero modifiers — no bevel, no solidify, no subdivision. Zero UVs, zero textures. |
| The runtime is primitives too | 247 `BoxGeometry` sites and 512 `new Mesh(` sites in `GameWorld.ts` alone; 208 more in `procedural.ts`. |
| Nothing is grounded | No `castShadow`, `receiveShadow` or `shadowMap` anywhere in the codebase. |
| Lighting is washed flat | `GameWorld.ts:220-222` — hemisphere 1.85 + ambient 0.92 = **2.77 units of directionless light** against a 1.55 sun. Form cannot survive that ratio. |
| Line work is silhouette-only | `style.ts:130` inverted hull at a uniform `1.07` scale. No crease lines, no interior detail, and the uniform scale is geometrically wrong on any non-cube mesh. |
| Cel ramp barely bites | `style.ts:76-93` — 3 steps with the darkest at 72/255. The shadow step is already 28% grey before ambient lifts it further. |
| No post-processing exists | No `EffectComposer` / `RenderPass` / `ShaderPass` in `src/`. |
| No instancing exists | No `InstancedMesh` in `src/`. Every prop and every outline hull is its own draw call. |

So: the last ~40 roadmap entries added **places**. The stranger test is about **presentation**. Those
are different axes, and we have been sprinting along the first one.

---

## 2. The gap, ranked by visible impact

Nine differences, read directly off the reference material.

| # | Messenger does | We do | Fix lives in |
| --- | --- | --- | --- |
| 1 | One hard sun, crisp cast shadows, real contact darkness | No shadows at all; 2.77:1.55 ambient-to-sun | `GameWorld.ts` lighting block |
| 2 | Silhouette **and** crease lines at constant screen width, on everything | Inverted-hull silhouette only, wrong width per mesh | New edge pass; `style.ts` |
| 3 | Low, close, ~eye-height camera, framed by foreground poles/rails/awnings | 3.25 m up, 5.55 m back, FOV 40, nothing in the foreground | `camera.ts`, `GameWorld.ts:5212` |
| 4 | Painterly surfaces; wobbly hand-drawn boundaries between grass/sand/stone | Flat colour fields with hard geometric edges | `style.ts` paint textures, terrain |
| 5 | No two buildings share a silhouette | 8+ identical terracotta pyramids in one frame | Kit variants, per-instance jitter |
| 6 | Specific junk at three depths, filling the frame | Sparse props on an open lawn | District data + kit density |
| 7 | Readable drawn figure — hair shape, cloth fall, bag, walk cycle | Stacked boxes, no walk cycle | `char-player.glb`, character kit |
| 8 | Tiny icon chips; a `...` bubble is the entire interaction UI | Large opaque cards; floating place-name labels read as debug output | `App.svelte`, `app.css` |
| 9 | Buildings 4–8× the character; camera sits in a street canyon below the eaves | Buildings 1.8×; camera 1.35 m *above* the eaves, hiding the player behind roofs | **M0** — `build_house`, `GameWorld.ts:5212` |
| 10 | Phone capture is **portrait**; desktop is landscape | Landscape on both | Open product question — see §9 |

Items 1–3 need **no new art**. They are the largest jump available and they are the cheapest.

---

## M0 — Camera occlusion and world scale

*A defect, not a polish item. The player is being hidden behind roofs. Fix before anything else —
you cannot run the stranger test on a frame where you cannot find the character.*

### The measurement

| Thing | Ours | Source |
| --- | --- | --- |
| Character height | ~1.5 m | `build_character`, head tops out just above the 1.18 m neck |
| House eaves | **1.90 m** | `build_house` — `0.18` plinth + `1.72` body |
| House ridge | **2.72 m** | eaves + `0.82` roof rise |
| Street camera height | **3.25 m** | `GameWorld.ts:5212` |

**The camera flies 1.35 m above the eaves and 0.53 m above the ridge.** It is at roof altitude by
construction, so every building it passes puts a roof plane straight into the near frustum. That is
the salmon mass filling two thirds of the reported frame, and the heavy black bands across it are
inverted-hull outline shells seen *from inside* — the camera is within the roof's outline volume.

The deeper number is the ratio. Our buildings are **1.8× the character's height**. In the desktop
capture, Messenger's are comfortably 4–8×. That is why its camera can sit at chest height inside a
street canyon (`desk_08`: buildings a metre either side, character perfectly readable) while ours has
to climb above the rooftops to show a town at all. **Camera height and world scale are one problem.**
Lowering the camera alone would leave us looking across a field of doll-house roofs.

Roof overhang is *not* the culprit — `gable_roof(width + 0.28)` is only a 0.14 m eave. The reported
"protruding features" are roofs the camera is flying through, not roofs that project too far.

### Why the existing guard does not fire

`firstCameraBlockDistance` casts **one ray** from the player's chest to the camera's centre point,
and `occludedFollowDistance` shortens the follow distance on a hit. Three ways that fails here:

- **A ray is not a frustum.** An eave can miss the centre ray completely while filling half the
  screen. In the reported frame the guard almost certainly never fired.
- **Pulling in along the same vector does not escape a roof.** The offset is back *and up*, so
  shortening it keeps the camera at similar altitude — still inside the roof volume, just nearer.
- **`minDistance = 1.05`** lets the recovery itself park the camera a metre from the player with a
  0.1 near plane, which is its own way of ending up inside geometry.

### Tasks

- [x] **M0.1 Raise the buildings.** Ravnbro frontages are now two-storey. `buildGableHouse` and
      `build_house` take a `storeys` count, upper floors get their own window row, and the shared
      numbers live in `src/lib/game/kit/scale.ts` (mirrored in the exporter). Measured from the
      exported `.glb`: character 1.76 m, house eaves 4.58 m, ridge 5.38 m (**3.05×**, was 1.5×).
      The station was raised to match — its wing eaves land on the same cornice line as the houses
      (4.56 vs 4.58) and its hall rises above as the civic accent.
      **Still outstanding:** Harbour and Moonhill frontages were *not* raised. Their kits still top
      out at 1.5–2.7 m, so those two districts remain doll-house scale even though their cameras
      came down. See M0.8.
- [x] **M0.2 Drop the camera into the canyon.** 3.1–3.25 m → **2.0–2.1 m**, follow 5.2–5.55 →
      4.25–4.4. The six duplicated profile literals in `GameWorld.ts` are now one
      `streetCameraProfiles` table in `camera.ts`, and `camera.test.ts` asserts the ceiling
      (`MAX_STREET_CAMERA_HEIGHT`, 2.18 m) plus a >2 m gap under the eaves. The arrival move also
      dropped from 8.4 m — it used to drag the descent straight through the roof band.
- [x] **M0.9 Character facing** *(found during M0 verification)*. Every character walked backwards:
      the Blender figure is modelled facing +Y, which exports to glTF **−Z**, while the runtime aims
      **+Z** via `atan2(dx, dz)` — the convention `docs/ART_PIPELINE.md` documents and the procedural
      fallback already used. Fixed at the source by turning the exported root 180°, so the `.glb`
      now matches the contract. This affected the player, the keeper and the street walkers.
- [x] **M0.3 Sweep, not a single ray.** `firstCameraBlockDistance` now casts a bundle of five
      parallel rays across `CAMERA_PROBE_RADIUS` (0.42 m) — centre plus four perpendicular offsets —
      and takes the nearest hit. three.js has no sphere cast; this is the cheap stand-in.
- [x] **M0.4 Characters no longer block the camera** *(the real cause of the walking failure)*.
      Driving the game with `tools/browser-driver.js` and inspecting the scene showed the frame was
      filled by the **station keeper's head at 0.62 m** — not a roof. The keeper is added straight to
      its district group rather than to a `streetLife` group, so the occlusion guard treated a person
      standing in the street as a building, hauled the camera in to escape them, and parked it inside
      their face. Every character kit is now tagged `cameraPassThrough` in `KitLoader.create` (both
      the glTF and procedural paths), so the tag cannot be missed however an NPC is placed.
      **Remaining half — see M0.4b.**
- [x] **M0.4b An NPC standing between camera and player still hides them.** Both halves landed.
      Standing keepers/wardens now occupy `STREET_NPC_RADIUS` (0.48 m) so the player stops in front
      of them instead of walking through; talk range stays 1.85–2.0 m, which leaves more than a
      metre of clearance so no quest is locked behind a body. Anyone on the camera→player segment
      (including the two Ravnbro walkers) ghosts to 16% opacity and hides their shared outline
      shell, then restores when they step off the line. The hillside keeper also moved off the
      hero centreline (`1.72, 2.35`) so the start frame is no longer a hat sitting on the player's
      head. Helpers live in `npc.ts`.
- [ ] **M0.5 Hard near-camera cull.** Not currently reproducible — after M0.3/M0.4/M0.6 no frame on
      the walked route put geometry in the camera's face. Keep as a backstop if one shows up; do not
      add the complexity speculatively.
- [x] **M0.6 Raise `minDistance`** — 1.05 m → `MIN_FOLLOW_DISTANCE` 2.2 m. At a metre from a 1.76 m
      character the avatar fills the screen and the 0.1 m near plane sits inside whatever the camera
      backed into, so the guard was creating the frame it exists to prevent.
- [x] **M0.7 Camera-corridor rule for layout.** Recorded as `MIN_STREET_CORRIDOR_WIDTH` 4.2 m in
      `kit/scale.ts` and [ART_PIPELINE.md](./ART_PIPELINE.md). That is the Ravnbro hero road: the
      follow rig sits 4.25–4.4 m behind the player with a 0.42 m probe bundle, so a narrower pocket
      puts flanking eaves into the near frustum.
- [x] **M0.8 Raise Harbour and Moonhill frontages** to the same contract. Street houses, sheds and
      shops now go through `buildGableHouse` (eaves 4.58 m). The warehouse, observatory and pier
      beacon are custom two-storey / civic-height kits. Open racks and the skyrail shelter lift
      their canopies above the camera (2.8 m). Tide Garden and Moonhill cone-pines are
      `tree-broad` at street scale. `MIN_STREET_EAVES` is now a three-district number. Re-export
      the matching `.glb` files so the loader does not keep serving the doll-house meshes.
- [x] **M0.10 Roof pitch pass.** `roofRidgesAlongStreet` (aspect ≥ 1.45) turns the ridge along the
      street so a wide shed is not a shallow triangle. The warehouse and depot cross that line;
      typical houses keep a gable to the road. `ROOF_RISE` 0.82 → **1.05** so even a short gable
      reads from the low camera. `createFootprintGableRoof` is the shared helper; the station wing
      already used the same rule by hand.

**Acceptance:** walk the full hero corridor in desktop landscape and in a narrow lane. The character
is continuously visible; no frame contains a full-screen roof plane or an outline backface.

**Status (2026-08-12):** Ravnbro passes standing still — the camera sits in the street canyon, the
player is continuously visible at the station forecourt, and the station reads as a civic anchor
rather than a roof slab across the frame.

**It now passes while walking too.** Walking the same route that previously jammed the camera into
scenery, camera-to-player distance holds between **4.6 m and 5.1 m** across the whole corridor
(it was collapsing to **1.74 m**). Measured with `tools/browser-driver.js` plus the dev-only
`window.__game` handle:

| | Before M0.3–M0.6 | After |
| --- | --- | --- |
| Camera→player at the failure spot | 1.74 m | **4.85 m** |
| Nearest mesh to camera | 0.62 m (keeper's head) | 1.8 m |
| Range over the walked route | collapsed | **4.6–5.1 m** |

M0 is closed for the reported camera-in-the-roof defect. Remaining M0 items are either
speculative backstops (M0.5) or already landed. The stranger test now moves to M1's ink
pass and M3's authored surfaces.

---

## M1 — Light and Line

*No new geometry. This phase alone should be visible in a side-by-side.*

The current world looks like plastic because it is lit like a product photo and outlined like a
prototype. Both are single-file fixes.

- [x] **M1.1 Rebalance the key.** Hemisphere 1.85 / ambient 0.92 / sun 1.55 → **0.4 / 0.21 / 1.5**.
      Directionless fill dropped from 2.77 units to 0.61, so the key is now roughly 2.5× the fill
      instead of being buried under it. `TOON_SHADE_FLOOR` came down 72 → 44 in the same pass; the
      ramp and the light ratio cancel each other out if only one moves. Tuned live against the
      running game rather than guessed — 2.4 on the sun bleached every lit surface to near-white.
- [x] **M1.2 One shadow-casting sun.** `PCFSoftShadowMap`, a single fixed ±20 m orthographic
      frustum, 1024² on desktop and 512² on coarse-pointer devices. A fixed frustum covers a whole
      district, so it never chases the player and cannot shimmer. Sun dropped to **~29° elevation**:
      a high sun casts stubby shadows that read as dirt, while a raking one makes shadow a
      compositional element the way the reference does. `applyCelShadows` sets cast/receive in one
      pass over the built scene, skipping inverted-hull outlines — letting those cast would draw a
      second, offset shadow around every object — and skipping meshes above a 40 m bounding radius,
      which is the terrain shells and the sea.

      **Cost, measured on an M2 Max desktop** (`renderer.info` via the dev handle):

      | | Draw calls | Triangles | ms/frame |
      | --- | --- | --- | --- |
      | Shadows off | 267 | 15,555 | 14.26 |
      | Shadows on | **509** | 29,676 | **16.52** |

      The shadow pass nearly doubles draw calls, because the shadow camera sees the whole district
      while the player camera sees a slice of it. That cost was then largely bought back by the
      caster size budget in **M6.2** — see there for the numbers. Verify on a real phone before
      assuming the 512² map is enough.
- [x] **M1.3 Depth + normal edge pass.** `InkPass` renders the scene to colour+depth, then once
      more with `MeshNormalMaterial`, then composites a Sobel of both at constant screen width.
      Window frames, roof seams and timber joints now carry ink the hulls could not draw. Fog
      fades the lines out with distance. `?ink=0` restores the old hull path. ART_DIRECTION.md
      now permits this bounded stack and still bans SSAO/bloom.
- [x] **M1.4 Retire inverted hulls** *(first cut).* When the ink pass is on, hull shells are
      hidden. `addMeshOutline` stays in the kit so `?ink=0` still has a silhouette. A later pass
      can delete the hulls from kits that do not need a thicker hero weight.
- [ ] **M1.5 Paper grade.** A cheap final pass: slight desaturation toward the palette, a faint paper
      grain, gentle warm/cool split between lit and shade. No bloom, no SSAO.

**Acceptance:** stand at Station Gate, hide the UI, screenshot. Buildings sit *on* the ground with
visible cast shadows; window frames and roof seams carry ink; nothing reads as plastic.

**Status (2026-08-14):** M1.1–M1.4 are in. Forms have a lit/shade split, raking shadows, and
screen-space ink on both silhouettes and creases. M1.5 (paper grade) is the remaining M1 item.

ART_DIRECTION.md was amended: a bounded ink+grade stack is allowed; SSAO and bloom stay banned.

---

## M2 — Camera and Frame

*Still no new art. Reframing what already exists.*

Messenger's camera is the reason its worlds feel inhabited rather than surveyed. Ours currently
surveys.

- [ ] **M2.1 Drop and close the rig.** Toward height ~1.9 m, follow ~4.3 m, `lookHeight` ~1.0 in
      `GameWorld.ts:5212` and its two sibling profiles. The player should occupy 30–40% of frame
      height, not 15%.
- [ ] **M2.2 Widen slightly.** FOV 40 → 48–52. Street depth and building convergence come from FOV,
      and every Messenger street shot has strong convergence.
- [ ] **M2.3 Foreground framing anchors.** Place tall thin elements — poles, wires, rail uprights,
      awning corners, near-camera foliage — along the hero corridor so at least one edge of the frame
      is occupied at close depth. Compare `Screenshot ... 12.29.25.png`, where two poles and a guard
      rail carry the composition.
- [ ] **M2.4 Camera lag and lead.** Small spring on follow, slight lead into turns. Cheap, and it is
      most of the difference between "attached to a character" and "filming a character".
- [ ] **M2.5 Re-tune fog.** Fog is 18–58 against a 120 far plane; once the camera is low, that range
      needs re-checking so the horizon reads as soft paper rather than a wall.

**Acceptance:** a walk down the hero corridor produces at least three frames that could be cropped as
postcards without further work.

---

## M3 — Surface and Silhouette

*Where real art hours start. Everything above must land first — it changes what you are painting for.*

- [ ] **M3.1 Wobbly material boundaries.** Grass over sand over stone with hand-drawn irregular edges
      instead of geometric patches. Messenger's terrain is *painted*, not tiled — see the grass/sand
      interface in `Screenshot ... 12.33.07.png`.
- [ ] **M3.2 A drawn-detail decal set.** Cracks, plank seams, brick courses, moss, scribbled grass
      tufts, wall stains. In the reference these are visibly *drawn marks*, not noise textures.
- [ ] **M3.3 Break the roofline.** Roof variants (gable, half-hip, mono-pitch, stepped), plus
      per-instance jitter of height, width, pitch and hue. Hard rule: **no two buildings in one frame
      may share a silhouette.**
- [ ] **M3.4 Give the Blender script a real vocabulary.** Bevel and solidify modifiers, deliberate
      asymmetry, applied edge wear. A beveled box catches the light and takes an outline like a drawn
      object; a raw box cannot. This is the change that makes the existing `.glb` pipeline *worth*
      having.
- [ ] **M3.5 Density pass on the hero corridor.** Junk at three depths, every piece specific — see
      §6 in the ranked table.

**Acceptance:** checklist 1, 2, 4 and 5 in [ART_PIPELINE.md](./ART_PIPELINE.md) §"Definition of done"
pass under honest review.

---

## M4 — Characters

- [ ] **M4.1 Rebuild the player.** Hair as a shaped mass, cloth with fall and hem, a bag that reads
      from behind. Currently a box stack.
- [ ] **M4.2 A walk cycle.** Even four poses beats the current rigid slide. Reduced-motion setting
      must still be honoured.
- [ ] **M4.3 NPC variety** from one base kit — silhouette, palette and prop swaps.
- [ ] **M4.4 The `...` bubble.** Replace proximity dialogue panels with the floating three-dot bubble
      seen in `Screenshot ... 12.29.25.png` and in the phone capture. It is the whole interaction
      affordance in the reference.

**Acceptance:** the player is recognisable from behind at 25% frame height.

---

## M5 — UI Restraint

Messenger's entire HUD is four icon chips and a speech bubble. Ours used to be two opaque cards, a
route banner, a permanently-disabled EXPLORE button and floating place-name labels.

- [x] **M5.1 Icon chips.** The walking HUD is now a single pill (`0/3 Signal box`) that opens the
      old quest card on tap. Ride/return actions live in that sheet. The empty EXPLORE button is
      gone — the interact chip only appears when something is in range. Header chips shrink on
      portrait; the wordmark hides. Touch feedback is a Messenger-like finger halo, not a ring+arrow.
- [x] **M5.2 Kill the floating place-name labels.** `createSign` now stamps sprites as `placeLabel`
      and hides them. Station boards, quest markers and interior maps call `keepSign` to stay
      visible. Shop/lane names (`PARCEL LANE`, `NORTH MARKET WALK`) no longer hover in world space.
      Drawn signage is still the longer-term home for names.
- [ ] **M5.3 District title cards.** Chunky display type on entry, as in the `THE FOREST` frame. We
      already have timed arrival cards — this is a restyle, not new plumbing.
- [x] **M5.4 Let the world breathe** *(first cut, 2026-08-13 iPhone 17 recordings).* Permanent
      walking chrome is the three header chips plus the quest pill. The disabled EXPLORE, the
      "Next: Signal box" cue, the wordmark and the place-name sprites are gone from the walking
      frame. Portrait follow is now `1.52×` with FOV 56 so the character is no longer a wall of coat.
      Arrival/journey/station/dialogue cards still take more than 12% when they are on screen —
      those are moments, not the walking HUD.

---

## M6 — Performance and Structure

Runs alongside M1–M5. These are the things that will otherwise block them.

- [ ] **M6.1 Instance the repeats — smaller win than assumed; measure before doing it.**
      Ravnbro has **1,330 unique geometries across 1,527 meshes**: only 128 groups share geometry at
      all. Every prop is built with its own `new BoxGeometry(w, h, d)` at bespoke dimensions, so
      there is very little for `InstancedMesh` to collapse — the total available saving is about
      **197 draw calls**, for a large restructure of a 5,800-line file. Worth doing only after the
      kit vocabulary is standardised (M3.4), which is what would create real repeats.
- [x] **M6.2 A draw-call budget — first cut taken.** The M1.2 shadow pass is a second draw of every
      caster, and the world is assembled from hundreds of small parts (window frames, sills, beams,
      bollards, crates) whose shadows are invisible at street scale. `applyCelShadows` now applies a
      `MIN_SHADOW_CASTER_RADIUS` of 0.6 m, with characters exempt via the `cameraPassThrough` tag —
      they are built from small parts too, but the shadow under a person is the one that matters.

      | | Casters in scene | Dense frame draw calls | ms/frame |
      | --- | --- | --- | --- |
      | All casters | 3,218 | 1,863 | 9.51 |
      | Size budget | **759** | **704** | **7.57** |

      Visually indistinguishable in a side-by-side from the same position. Note the budget swings
      hard with viewpoint — the same district measured 542 calls in one spot and 2,081 in another —
      so any future target has to be quoted against a named vantage point, not an average.

      **Measuring it:** `?perf=1` shows fps, ms/frame, draw calls, triangles and the live pixel
      ratio, on a production build. See "Profiling on a real iPhone" in
      [ART_PIPELINE.md](./ART_PIPELINE.md).

      **First device reading (iPad mini, ~4 years old):** ~36–43 fps, **23–28 ms/frame**,
      400–1,200 draws, pixel ratio holding at its 1.65 ceiling, and it *feels* responsive.

      That last part matters more than it looks. The adaptive policy only throttles above
      **34.5 ms** (29 fps) and only recovers below **19.2 ms** (52 fps), so the device is sitting in
      the dead band between the two: comfortably clear of degradation, but never a candidate for
      recovery either. Two consequences:

      - The image is at full density, so the frame cost is honest — nothing is being hidden by a
        resolution drop.
      - **Headroom before the picture visibly degrades is only ~6–11 ms.** Crossing 34.5 ms drops
        the pixel ratio, and since the recovery threshold is 19.2 ms it would not climb back. Any
        new per-frame cost — M1.3's ink pass above all — has to fit inside that margin.

      **The device is fill-rate bound.** Same iPad at `?dpr=0.8` — 23.5% of the pixels — reports
      50–60 fps at 16.7 ms. Fill is therefore **at least 11.5 ms of the 25.5 ms frame (≥45%)**, and
      probably more: 16.7 ms is exactly the 60 Hz vsync interval, so the low-density cost is clamped
      and the true saving is larger than measured.

      **The hulls are not the fill cost.** Hypothesis tested and rejected: `?outlines=0` at full
      density measured **35–45 fps against a 36–43 fps baseline** — no change beyond noise, so the
      ~732 inverted-hull shells cost effectively nothing. M1.4 therefore hands back almost no budget,
      and cannot be used to pay for M1.3.

      **Shadow filtering is not the cost either.** Also tested and rejected, on the same iPad at full
      density:

      | Setting | fps |
      | --- | --- |
      | `shadows=soft` (default) | 36–43 |
      | `shadows=pcf` | 35–45 |
      | `shadows=basic` | 35–45 |
      | `shadows=off` | 40–50 |

      Filter type makes **no difference at all**, so per-fragment shadow taps are not it. Removing
      shadows entirely buys only ~3 ms, and that is mostly the second geometry pass rather than a
      per-pixel saving. Roughly 8 ms that scales with resolution remains unexplained; `?aa=0` (MSAA
      off) is the next candidate, since multisample resolve and its bandwidth scale the same way.

      **On an iPhone 17 the game holds 60 fps regardless of any shadow setting.** So this is an
      old-device budget question, not a general one. That matters for M1.3: the adaptive resolution
      policy already exists to trade density for frame rate, so a fullscreen ink pass would stay
      sharp on current phones and degrade gracefully on a 4-year-old iPad, which is exactly the
      behaviour that policy was written for.

      **Three hypotheses, three rejections — stop guessing here.** Hulls, shadow filter and shadow
      pass have all been priced and none explains the resolution-scaling cost. If `?aa=0` does not
      account for it either, the next step is a real GPU capture (Safari Web Inspector's Canvas
      timeline), not another flag.
- [ ] **M6.3 Extract district data from `GameWorld.ts`.** 5,786 lines and growing by a pocket per
      commit. Placement should be declarative data so an art pass does not mean editing a monolith.
      This is the main structural risk to every phase above.
- [ ] **M6.4 Fix the hidden-tab first frame.** With `document.visibilityState === 'hidden'` the canvas
      renders *nothing* rather than a settled frame — reproduced in the browser pane during this
      review. Rendering one frame before pausing removes a class of "blank game" reports.

---

## 7. Sequencing

```text
M0 Scale + Camera ──► M1 Light + Line ──► M2 Camera + Frame ──► M3 Surface ──► M4 Characters
   (defect fix)          (no new art)        (no new art)         (art hours)    (art hours)
        │                                                              ▲
        └───────────────── M6 Perf + Structure ────────────────────────┘
                           M5 UI (any time)
```

**M0 first** — it is a bug, and it moves the building heights that M2 then frames.

Do not start M3 before M0–M2 land. Painting surfaces under flat light and a surveying camera means
painting them twice — and it is how the last forty roadmap entries were spent.

M2 absorbs whatever M0 leaves: M0.2 gets the camera below the eaves so the player stays visible, M2
then tunes it for composition. If the two disagree, M0's invariant wins.

---

## 8. The stranger test

The only acceptance test that matters. Run it at the end of each phase:

1. Enter Ravnbro, walk the hero corridor, hide all UI.
2. Screenshot at street height.
3. Place it beside `Messenger/Screenshot 2026-08-09 at 12.27.15.png`.
4. Ask someone who has not seen either: *same kind of game?*

Record the answer in this file per phase. An honest "no, ours looks like a prototype" is worth more
than another completed pocket.

---

## 9. Open product question — phone orientation

**Desktop is settled.** `Messenger/Screen Recording 2026-08-11 at 22.00.14.mov` is 4096×2334
landscape, so the reference itself is landscape on desktop and our landscape web app matches it. No
change needed, and the desktop capture is now the primary camera reference for M0 and M2.

**Phones are not.** `Messenger/MessengerVideoPhone.MP4` is 1206×2622 — portrait, with the character
low in a tall frame, buildings towering, and a translucent touch puck appearing wherever the thumb
lands. Our README commits to iPhone **landscape**.

The tall frame is not just a crop: it is what makes M0.1's building heights pay off on a phone, and a
rig tuned for 16:9 will not survive 9:19.5. This is a product decision, not an art one, and it needs
an answer before the phone camera profile is tuned. Flagged, not assumed.

---

## 10. Explicitly out of scope

Unchanged from [ART_DIRECTION.md](./ART_DIRECTION.md): photoreal or photo-sourced textures,
asset-pack geometry, SSAO, heavy bloom, and any copying of Messenger's characters, glyphs, signage or
props. Messenger is a reference for *feel* — camera, line weight, restraint, density. Every asset we
ship stays original.
