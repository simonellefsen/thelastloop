"""
Original Ravnbro hero kits for The Last Loop.

  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender/export_ravnbro_kits.py

Units: metres. Bottom of kit on Z=0. Street façade faces +Y (glTF export Y-up → +Z).
"""

from __future__ import annotations

import math
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "assets" / "gltf"

CREAM = (0.949, 0.910, 0.831, 1.0)
OCHRE = (0.878, 0.722, 0.416, 1.0)
ROSE_BRICK = (0.714, 0.353, 0.282, 1.0)
WHITEWASH = (0.969, 0.945, 0.894, 1.0)
TERRACOTTA = (0.769, 0.361, 0.227, 1.0)
TERRACOTTA_DEEP = (0.659, 0.290, 0.196, 1.0)
TIMBER = (0.227, 0.165, 0.141, 1.0)
TIMBER_SOFT = (0.341, 0.259, 0.224, 1.0)
GLASS = (0.863, 0.910, 0.875, 1.0)
DOOR = (0.192, 0.333, 0.357, 1.0)
COBBLE = (0.702, 0.604, 0.455, 1.0)
COBBLE_PALE = (0.831, 0.776, 0.643, 1.0)
GRASS = (0.435, 0.678, 0.384, 1.0)
GRASS_DEEP = (0.310, 0.541, 0.322, 1.0)
METAL = (0.173, 0.208, 0.220, 1.0)
BAG = (0.420, 0.275, 0.212, 1.0)
DARK_BRICK = (0.498, 0.212, 0.184, 1.0)
CLOCK = (0.953, 0.933, 0.843, 1.0)


def log(msg: str) -> None:
    print(f"[ravnbro-kits] {msg}", flush=True)


def clear_scene() -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.objects, bpy.data.collections):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def mat(name: str, rgba: tuple[float, float, float, float]):
    m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = 0.95
        bsdf.inputs["Metallic"].default_value = 0.0
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.05
    return m


def new_root(name: str) -> bpy.types.Object:
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    return root


def parent(obj: bpy.types.Object, root: bpy.types.Object) -> bpy.types.Object:
    obj.parent = root
    return obj


def box(root, name, size_xyz, loc_xyz, material, rot_z=0.0):
    """Full dimensions (w, d, h); location is centre."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc_xyz)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size_xyz[0] * 0.5, size_xyz[1] * 0.5, size_xyz[2] * 0.5)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.location = loc_xyz
    obj.rotation_euler[2] = rot_z
    obj.data.materials.append(material)
    return parent(obj, root)


def cylinder(root, name, radius, depth, loc, material, verts=12, rot_x=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.rotation_euler[0] = rot_x
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    obj.location = loc
    obj.data.materials.append(material)
    return parent(obj, root)


def sphere(root, name, radius, loc, material, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=8, radius=radius, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.location = loc
    obj.data.materials.append(material)
    return parent(obj, root)


def plane(root, name, size_xy, loc, material):
    """Vertical plane facing +Y (street). size = (width X, height Z)."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size_xy[0] * 0.5, size_xy[1] * 0.5, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler = (math.pi / 2, 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    obj.location = loc
    obj.data.materials.append(material)
    return parent(obj, root)


def gable_roof(root, name, width, depth, height, base_z, material, cx=0.0, cy=0.0):
    hw, hd, h = width * 0.5, depth * 0.5, height
    z0, z1 = base_z, base_z + h
    verts = [
        (cx - hw, cy - hd, z0),
        (cx + hw, cy - hd, z0),
        (cx + hw, cy + hd, z0),
        (cx - hw, cy + hd, z0),
        (cx, cy - hd, z1),
        (cx, cy + hd, z1),
    ]
    faces = [
        (0, 1, 4),
        (3, 5, 2),
        (0, 4, 5, 3),
        (1, 2, 5, 4),
        (0, 3, 2, 1),
    ]
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=False)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    return parent(obj, root)


def snap_root_to_ground(root: bpy.types.Object) -> None:
    """Apply child transforms into world, then shift root so bottom is Z=0 and XY centred."""
    # Update depsgraph
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    any_mesh = False
    for obj in root.children_recursive:
        if obj.type != "MESH":
            continue
        any_mesh = True
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
            maxs.z = max(maxs.z, world.z)
    if not any_mesh:
        return
    cx = (mins.x + maxs.x) * 0.5
    cy = (mins.y + maxs.y) * 0.5
    root.location.x -= cx
    root.location.y -= cy
    root.location.z -= mins.z
    bpy.context.view_layer.update()


def export_root(root: bpy.types.Object, filename: str) -> None:
    snap_root_to_ground(root)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / filename
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_yup=True,
        export_animations=False,
    )
    log(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


def build_house(wall, roof, width=2.85, body_h=1.72, depth=2.15, bakery=False, filename="house.glb"):
    clear_scene()
    root = new_root("House")
    m_wall = mat("Wall", wall)
    m_roof = mat("Roof", roof)
    m_timber = mat("Timber", TIMBER)
    m_glass = mat("Glass", GLASS)
    m_door = mat("Door", DOOR)
    m_cobble = mat("Cobble", COBBLE)
    m_grass = mat("Grass", GRASS_DEEP)
    m_brick = mat("Brick", ROSE_BRICK)
    m_soft = mat("SoftWood", TIMBER_SOFT)
    m_awning = mat("Awning", OCHRE)

    box(root, "plinth", (width + 0.12, depth + 0.12, 0.18), (0, 0, 0.09), m_cobble)
    box(root, "body", (width, depth, body_h), (0, 0, 0.18 + body_h * 0.5), m_wall)
    box(root, "wing", (width * 0.55, depth * 0.45, body_h * 0.72), (width * 0.1, -depth * 0.25, 0.18 + body_h * 0.36), m_wall)
    eaves = 0.18 + body_h
    gable_roof(root, "roof", width + 0.28, depth + 0.28, 0.82, eaves, m_roof)
    gable_roof(root, "wing_roof", width * 0.62, depth * 0.55, 0.48, 0.18 + body_h * 0.72, m_roof, cx=width * 0.1, cy=-depth * 0.25)

    front = depth * 0.5 + 0.03
    for x in (-width * 0.38, 0.0, width * 0.38):
        box(root, f"up_{x:.2f}", (0.1, 0.08, body_h + 0.06), (x, front, 0.18 + body_h * 0.5), m_timber)
    for z in (0.55, eaves - 0.28):
        box(root, f"beam_{z:.2f}", (width + 0.06, 0.08, 0.09), (0, front, z), m_timber)
    for x in (-width * 0.28, width * 0.28):
        box(root, f"wf_{x:.2f}", (0.5, 0.07, 0.58), (x, front + 0.02, 0.18 + body_h * 0.58), m_timber)
        plane(root, f"glass_{x:.2f}", (0.36, 0.44), (x, front + 0.06, 0.18 + body_h * 0.58), m_glass)
        box(root, f"sill_{x:.2f}", (0.52, 0.12, 0.05), (x, front + 0.05, 0.18 + body_h * 0.42), m_timber)
    box(root, "door_frame", (0.68, 0.08, 1.05), (0, front + 0.02, 0.7), m_timber)
    plane(root, "door", (0.52, 0.92), (0, front + 0.07, 0.66), m_door)
    box(root, "step", (0.9, 0.32, 0.1), (0, front + 0.22, 0.05), m_cobble)
    box(root, "chimney", (0.24, 0.26, 0.62), (width * 0.28, -depth * 0.08, eaves + 0.55), m_brick)
    box(root, "flower_box", (0.44, 0.2, 0.16), (width * 0.32, front + 0.12, 0.7), m_soft)
    box(root, "flowers", (0.4, 0.16, 0.14), (width * 0.32, front + 0.12, 0.84), m_grass)
    if bakery:
        box(root, "awning", (width - 0.2, 0.55, 0.14), (0, front + 0.28, 1.25), m_awning)

    export_root(root, filename)


def build_station():
    clear_scene()
    root = new_root("Station")
    m_brick = mat("Brick", ROSE_BRICK)
    m_dark = mat("DarkBrick", DARK_BRICK)
    m_roof = mat("Roof", TERRACOTTA_DEEP)
    m_timber = mat("Timber", TIMBER)
    m_glass = mat("Glass", GLASS)
    m_door = mat("Door", DOOR)
    m_cobble = mat("Cobble", COBBLE)
    m_pale = mat("Pale", COBBLE_PALE)
    m_clock = mat("Clock", CLOCK)

    box(root, "plinth", (7.2, 2.4, 0.16), (0, 0, 0.08), m_cobble)
    box(root, "wing", (6.9, 2.0, 1.52), (0, 0, 0.16 + 0.76), m_brick)
    box(root, "hall", (2.65, 2.25, 2.25), (0, 0, 0.16 + 1.12), m_brick)
    for x in (-2.55, 2.55):
        box(root, f"bay_{x}", (1.55, 1.35, 1.35), (x, -0.35, 0.16 + 0.68), m_brick)
    gable_roof(root, "wing_roof", 7.25, 2.25, 0.78, 0.16 + 1.52, m_roof)
    gable_roof(root, "hall_roof", 2.9, 2.45, 1.0, 0.16 + 2.25, m_roof)
    front = 1.05
    for x in (-2.85, -1.9, -0.85, 0.85, 1.9, 2.85):
        box(root, f"wf_{x}", (0.5, 0.07, 0.58), (x, front, 0.95), m_timber)
        plane(root, f"wg_{x}", (0.38, 0.46), (x, front + 0.05, 0.95), m_glass)
    for x in (-0.55, 0.55):
        box(root, f"uwf_{x}", (0.42, 0.07, 0.55), (x, 1.16, 1.85), m_timber)
        plane(root, f"uwg_{x}", (0.32, 0.42), (x, 1.2, 1.85), m_glass)
    for x in (-0.4, 0.4):
        plane(root, f"door_{x}", (0.48, 0.95), (x, 1.14, 0.62), m_door)
    box(root, "canopy", (2.4, 0.7, 0.12), (0, 1.4, 1.2), m_pale)
    for x in (-2.6, -1.0, 1.0, 2.6):
        box(root, f"chim_{x}", (0.22, 0.24, 0.72), (x, 0, 2.55), m_dark)
    cylinder(root, "clock", 0.28, 0.07, (0, 1.18, 2.35), m_clock, verts=16, rot_x=math.pi / 2)
    cylinder(root, "forecourt", 2.7, 0.08, (0, 1.85, 0.04), m_cobble, verts=16)
    export_root(root, "ravnbro-station.glb")


def build_tree():
    clear_scene()
    root = new_root("Tree")
    m_trunk = mat("Trunk", TIMBER_SOFT)
    m_a = mat("CrownA", GRASS_DEEP)
    m_b = mat("CrownB", GRASS)
    h = 2.45
    cylinder(root, "trunk", 0.12, h * 0.42, (0, 0, h * 0.21), m_trunk, verts=8)
    for i, (z, r, material) in enumerate(
        [
            (h * 0.55, h * 0.28, m_a),
            (h * 0.72, h * 0.34, m_b),
            (h * 0.88, h * 0.26, m_a),
            (h * 1.02, h * 0.18, m_b),
        ]
    ):
        sphere(root, f"crown_{i}", r, (0, 0, z), material, scale=(1.15, 1.1, 0.85))
    export_root(root, "tree-broad-01.glb")


def build_bike():
    clear_scene()
    root = new_root("Bike")
    m_metal = mat("Metal", METAL)
    m_wood = mat("Wood", TIMBER)
    m_seat = mat("Seat", BAG)
    box(root, "frame", (0.95, 0.06, 0.06), (0, 0, 0.42), m_wood)
    for x in (-0.34, 0.34):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.22,
            minor_radius=0.035,
            major_segments=14,
            minor_segments=6,
            location=(x, 0, 0.24),
        )
        obj = bpy.context.active_object
        obj.name = f"wheel_{x}"
        obj.data.materials.append(m_metal)
        parent(obj, root)
    box(root, "handle", (0.45, 0.05, 0.05), (0.4, 0, 0.58), m_wood)
    box(root, "seat", (0.18, 0.14, 0.06), (-0.12, 0, 0.52), m_seat)
    export_root(root, "prop-bike-01.glb")


def main() -> int:
    log(f"Blender {bpy.app.version_string}")
    log(f"output → {OUT}")
    jobs = [
        ("house-cream", lambda: build_house(CREAM, TERRACOTTA, filename="ravnbro-house-cream-01.glb")),
        ("house-ochre", lambda: build_house(OCHRE, TERRACOTTA_DEEP, filename="ravnbro-house-ochre-01.glb")),
        ("house-brick", lambda: build_house(ROSE_BRICK, TERRACOTTA_DEEP, width=3.0, filename="ravnbro-house-brick-01.glb")),
        ("bakery", lambda: build_house(CREAM, TERRACOTTA, width=3.1, bakery=True, filename="ravnbro-bakery.glb")),
        ("depot", lambda: build_house(WHITEWASH, TERRACOTTA, width=3.4, body_h=1.85, filename="ravnbro-depot.glb")),
        ("home", lambda: build_house(OCHRE, TERRACOTTA_DEEP, width=2.75, filename="ravnbro-home-01.glb")),
        ("station", build_station),
        ("tree", build_tree),
        ("bike", build_bike),
    ]
    for name, fn in jobs:
        log(f"building {name}…")
        try:
            fn()
        except Exception as exc:
            log(f"FAILED {name}: {exc}")
            traceback.print_exc()
            return 1
    files = sorted(OUT.glob("*.glb"))
    log(f"done — {len(files)} glb files")
    for f in files:
        log(f"  {f.name} ({f.stat().st_size} B)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
