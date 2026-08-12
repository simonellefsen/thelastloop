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
- [ ] **M0.3 Sphere-cast, not ray-cast.** Sweep a sphere roughly the near-plane half-width from pivot
      to camera so wide flat occluders are caught before they reach the frustum.
- [ ] **M0.4 Duck and fade instead of pull in.** Prefer lowering or orbiting the camera to a clear
      line; dither-fade anything that still lands between camera and player. Alpha-fade occluders
      read well under cel shading and are the standard fix for exactly this.
- [ ] **M0.5 Hard near-camera cull.** Anything within ~0.6 m of the camera fades out entirely, so no
      recovery path can produce a full-screen backface again.
- [ ] **M0.6 Raise `minDistance`** above 1.05 so the guard cannot create the frame it exists to
      prevent.
- [ ] **M0.7 Camera-corridor rule for layout.** Streets need clear width for the rig to sit in.
      Record the minimum in [ART_PIPELINE.md](./ART_PIPELINE.md) so new pockets do not reintroduce
      this.
- [ ] **M0.8 Raise Harbour and Moonhill frontages** to the same contract. Their tallest kits are the
      crane (3.86 m) and the observatory (3.90 m); everything else sits at 1.5–2.7 m against a
      1.76 m character. Until this lands, `MIN_STREET_EAVES` is a Ravnbro number and the eave
      invariant is only genuinely enforced there.
      *Walked and verified 2026-08-12:* Harbour Works has **no occlusion problem** — its buildings
      are too short to hide anything — but it reads as a model village. The tidehouse is roughly the
      character's height, and its conifers are still cones on sticks, which fails checklist item 2
      in [ART_PIPELINE.md](./ART_PIPELINE.md). Raising it is a composition fix, not a bug fix, so it
      can follow M1.
- [ ] **M0.10 Roof pitch pass.** Raising the town exposed how shallow the roofs are. The station's
      long wing needed its ridge turned along the building (`ridgeAlongX` / `along_x`) because a wide
      span sloping to a short ridge reads as a flat slab from a low camera. Other long kits — rail
      shed, warehouse, tide shed — likely have the same problem and were not audited.

**Acceptance:** walk the full hero corridor in desktop landscape and in a narrow lane. The character
is continuously visible; no frame contains a full-screen roof plane or an outline backface.

**Status (2026-08-12):** Ravnbro passes standing still — the camera sits in the street canyon, the
player is continuously visible at the station forecourt, and the station reads as a civic anchor
rather than a roof slab across the frame.

**It does not yet pass while walking.** Driving the game with `tools/browser-driver.js` and walking
north from the start put the camera inside the station forecourt geometry within ~1.5 s: the frame
filled with a single pale surface. Raising the buildings removed the *cause* of the reported bug
(a rig flying at roof altitude) but the recovery is still the original single ray, so a wide
occluder that misses the centre ray is not detected at all. **M0.3–M0.6 are now the blocking work,
not optional hardening.**

---

## M1 — Light and Line

*No new geometry. This phase alone should be visible in a side-by-side.*

The current world looks like plastic because it is lit like a product photo and outlined like a
prototype. Both are single-file fixes.

- [ ] **M1.1 Rebalance the key.** Move toward roughly hemisphere 0.55 / ambient 0.25 / sun 2.2 and
      re-tune against `Messenger/Screenshot ... 12.33.07.png`, where the lit/shade split on the grass
      is close to two flat tones. Retune the `getToonGradientMap` floor down from 72 at the same
      time — the ramp and the light ratio have to be tuned together or one will fight the other.
- [ ] **M1.2 One shadow-casting sun.** `PCFSoftShadowMap`, a single tight orthographic frustum that
      follows the player (roughly ±18 m), 1024² on desktop and 512² on phones. Buildings, props and
      characters cast; ground and roads receive. This is the single biggest grounding win in the
      whole document.
- [ ] **M1.3 Depth + normal edge pass.** One fullscreen shader that reads depth and normals and
      draws both silhouette and crease lines at a constant screen-space width. This is what gives
      Messenger its printed look — see the window frames and panel seams in
      `Screenshot ... 12.27.15.png`, none of which an inverted hull can produce.
- [ ] **M1.4 Retire inverted hulls** once M1.3 lands, keeping `addMeshOutline` only where a hero mesh
      genuinely needs a thicker ink weight. This *removes* draw calls — currently every outlined mesh
      is drawn twice.
- [ ] **M1.5 Paper grade.** A cheap final pass: slight desaturation toward the palette, a faint paper
      grain, gentle warm/cool split between lit and shade. No bloom, no SSAO.

**Acceptance:** stand at Station Gate, hide the UI, screenshot. Buildings sit *on* the ground with
visible cast shadows; window frames and roof seams carry ink; nothing reads as plastic.

**Note on the doc conflict:** [ART_DIRECTION.md](./ART_DIRECTION.md) currently rules out
"expensive multi-pass post (SSAO, heavy bloom)". M1.3 and M1.5 are two fullscreen passes with no
blur chain and no sampling loops, and M1.4 pays for them by deleting a per-mesh draw call. That is
cheaper than what ships today. **ART_DIRECTION.md must be amended** to permit a bounded edge+grade
pass while keeping the ban on SSAO and bloom — otherwise this phase contradicts our own contract.

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

Messenger's entire HUD is four icon chips and a speech bubble. Ours is two opaque cards, a route
banner, an EXPLORE button and floating place-name labels.

- [ ] **M5.1 Icon chips.** Collapse the quest card into a small chip that opens a sheet on demand.
- [ ] **M5.2 Kill the floating place-name labels.** `NORTH MARKET WALK` and `LANTERN MAKER` hovering
      in world space read as debug output. Move names onto drawn signage, shopfronts and platform
      boards.
- [ ] **M5.3 District title cards.** Chunky display type on entry, as in the `THE FOREST` frame. We
      already have timed arrival cards — this is a restyle, not new plumbing.
- [ ] **M5.4 Let the world breathe.** Nothing permanently occupying more than ~12% of the frame.

---

## M6 — Performance and Structure

Runs alongside M1–M5. These are the things that will otherwise block them.

- [ ] **M6.1 Instance the repeats.** No `InstancedMesh` exists today. Trees, lamps, bollards, crates,
      cobbles and fence posts are the obvious candidates, and they are exactly what M3.5 is about to
      multiply.
- [ ] **M6.2 A draw-call budget.** Set a target, measure it on a real iPhone, and hold it. M1.4
      buys headroom; M3.5 spends it.
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
