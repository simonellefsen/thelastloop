# The Last Loop — Complete Planet Masterplan

## Non-negotiable world rule

The Last Loop is one inhabited railway planet, not three disconnected dioramas. Every playable district has a complete town fabric: a station or halt, connected streets and paths, shops and homes, a public green space, a shallow water crossing, and a visible two-way section of the same rail loop. A district may stream in at street detail, but it must always read as a place the train can enter and leave.

The present release makes the shared route explicit in the title atlas and in each street scene's through-section. Actual uninterrupted player or train travel between streamed street scenes is the next technical milestone; the route signs name the hand-off honestly and must not imply that a train can be boarded yet.

## Global rail spine

```text
Ravnbro ── Reedwater Viaduct ── Harbour Works
   ▲                                  │
   │                                  ▼
Nightfall Cutting ◀──── Moonhill ◀─ Tideway Causeway
```

The `globalRailStops` contract is the single source of truth for this order. Every new platform, siding, route board and title-map segment must attach to this loop; a spur must visibly join a through-track at both ends or be labelled as a genuine dead-end loading spur.

## Detail and traversal contract

| Layer | What the player sees | What must connect |
| --- | --- | --- |
| Planet atlas | Entire spherical outline, settlements, water, parks and continuous rail | All three named towns and the three inter-town links |
| District approach | Rail line arrives, crosses the edge of town and exits again | A through-section plus a signed road/path hand-off |
| Street fabric | Homes, shops, civic place, paths and water | At least two route choices between station/stop, park and water crossing |
| Interaction pocket | Quest prop, NPC or shop detail | An unobstructed approach, collision and an easy way back to the main route |

## Ravnbro — river station town

**Role:** the first town and civic heart of the loop.

- **Rail:** Ravnbro Station → North Yard → outer loop → Reedwater Viaduct. The existing freight spur remains a proper loading spur, while the new perimeter through-section makes the outbound direction readable.
- **Streets and shops:** Station Gate, Market Fold, Coppersmith Lane, Clockmakers' Court, bakery, lantern maker, post-and-goods depot and small homes form one walkable lattice rather than separate pockets.
- **Water:** Reedwater becomes a broad, knee-deep ford with stepping slabs and a low pedestrian bridge. It is walkable at the marked ford; elsewhere reeds and bollards guide the player away from deeper water.
- **Park:** Bell Orchard sits between Bell Rise and the river: benches, shade trees, an open grass slope, a small play of fireflies and a clear route back to the market.
- **Completion standard:** no blank grass between its named routes; the outer rail should be seen from at least two streets, and the river must offer one safe crossing and one scenic dead-end landing.

## Harbour Works — working tide town

**Role:** the industrial and maritime counterpoint, built around a tidal basin rather than an empty shore.

- **Rail:** Tideway Causeway → Harbour Works platform → Rail Shed / Chandlery loading connection → outer dock loop → Moonhill direction. The local shed rails remain connected to the outer through-section, not a free-standing set piece.
- **Streets and shops:** Dock Road, Tideyard, Repair Quay, Chandlery Yard, Tidehouse Row, a fish stall, rope-and-sail shop and repair workshops create a loop around the working water.
- **Water:** the tidal basin has a shallow stone apron and a plank ford at low water. The player can cross the marked shallows and footbridge; harbour walls and boats define unsafe edges without a hard rectangular map border.
- **Park:** Tide Gardens is a small salt-grass commons with wind-bent trees, a tide clock seat and views across the basin. It links the residential tidehouses back to the dock road.
- **Completion standard:** every quay has a landward route and an alternate waterside route; boat, crane and warehouse collision leave generous walking lines.

## Moonhill — hill and observatory town

**Role:** the quiet high terminus that reveals the loop's far horizon.

- **Rail:** Nightfall Cutting → Skyrail terrace → observatory approach → outer hill loop → Ravnbro direction. Signal Terrace is a true visible stop on the through-section, with a short platform and an open crossing.
- **Streets and shops:** Observatory Road, Lens Path, Archive Terrace, Comet Walk, Almanac Garden, a chart-maker's room, tea kiosk and a pair of small hill homes form a protected high street.
- **Water:** a spring stream runs across Comet Walk, crossed by flat stones and a short arched bridge. Its shallow water is walkable at the stones and helps the hill read as a living landscape.
- **Park:** Almanac Garden is the public green: moon dial, herbs, sheltered benches and a stargazing lawn that connects the observatory to the northern rail terrace.
- **Completion standard:** the dome remains the skyline anchor, but no route ends in uncomposed hill texture; each outward path resolves in a view, crossing, stop or small civic pocket.

## Build order

1. **Rail continuity foundation — in progress:** one code-owned global stop order; title route and visible local two-way through-sections.
2. **Ravnbro completion:** connect station rails to the outer line; build Bell Orchard and a real shallow Reedwater ford/bridge route.
3. **Harbour completion:** join Rail Shed to the through-line; build the tidal basin loop, marked shallow crossing and Tide Gardens.
4. **Moonhill completion:** join Signal Terrace to the through-line; build the spring crossing, Almanac Green and hill-street shop frontage.
5. **Seamless loop travel:** replace district changes with a streamed global coordinate system and rideable train transitions. This is the point at which the player can physically follow the complete rail line around the planet.

## Mobile rules

- The title view always fits the whole globe within the narrow iPhone width.
- Street scenes keep a slight rolling horizon, not a visibly spherical floor under the player.
- Repeated sleepers, lamps, trees and paving are instanced or shared; only the active district has L3 interaction props active.
- Water crossings must be legible with colour, stones and rails, never tiny UI labels alone.
