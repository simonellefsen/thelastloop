# Visual assets

Hero corridor `.glb` files are **generated originals** (not Marketplace / Messenger rips):

```bash
pnpm assets:export
# uses /Applications/Blender.app headless + tools/blender/export_ravnbro_kits.py
```

## Layout

```text
assets/
  gltf/
    ravnbro-house-cream-01.glb
    ravnbro-house-ochre-01.glb
    ravnbro-house-brick-01.glb
    ravnbro-station.glb
    ravnbro-bakery.glb
    ravnbro-depot.glb
    ravnbro-home-01.glb
    tree-broad-01.glb
    prop-bike-01.glb
    prop-planter-01.glb
    prop-laundry-01.glb
    harbour-warehouse-01.glb
    harbour-crane-01.glb
    harbour-repair-workshop-01.glb
    harbour-repair-boat-01.glb
    harbour-tidehouse-01.glb
    harbour-net-rack-01.glb
    harbour-tide-shed-01.glb
    moonhill-observatory-01.glb
    moonhill-telescope-01.glb
    moonhill-skyhouse-01.glb
    moonhill-moon-dial-01.glb
    moonhill-almanac-pavilion-01.glb
    moonhill-star-archive-01.glb
    moonhill-orrery-01.glb
    char-player.glb
    char-npc.glb
  textures/   # optional painted atlases later
```

Characters are Blender-authored but retain runtime customisation. Preserve mesh names beginning with `Coat`, `Hair`, `Hat`, and `Bag` when replacing `char-player.glb` or `char-npc.glb`, so the player wardrobe and NPC variants continue to work. Any missing asset falls back to the procedural kit.

See `docs/ART_PIPELINE.md` for units, origins, KitIds, and style rules.
