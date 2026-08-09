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
  textures/   # optional painted atlases later
```

Characters stay procedural (coat colour). Overwrite any `.glb` with a hand-modeled version using the same filename — no code change required.

See `docs/ART_PIPELINE.md` for units, origins, KitIds, and style rules.
