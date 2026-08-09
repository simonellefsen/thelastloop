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
SKIN = (0.922, 0.710, 0.553, 1.0)
HAIR = (0.188, 0.122, 0.098, 1.0)
COAT = (0.961, 0.682, 0.243, 1.0)
HAT = (0.192, 0.286, 0.333, 1.0)
SOCK = (0.765, 0.690, 0.584, 1.0)
SHOE = (0.129, 0.157, 0.169, 1.0)


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


def hemisphere(root, name, radius, loc, material, segments=12, rings=7):
    """Low-poly upper hemisphere with its flat edge resting on the base."""
    verts = [(0, 0, radius)]
    for ring in range(1, rings + 1):
        theta = (math.pi / 2) * ring / rings
        radial = math.sin(theta) * radius
        z = math.cos(theta) * radius
        for segment in range(segments):
            angle = math.pi * 2 * segment / segments
            verts.append((math.cos(angle) * radial, math.sin(angle) * radial, z))
    faces = []
    for segment in range(segments):
        faces.append((0, 1 + segment, 1 + (segment + 1) % segments))
    for ring in range(1, rings):
        start = 1 + (ring - 1) * segments
        next_start = start + segments
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            faces.append((start + segment, next_start + segment, next_start + next_segment, start + next_segment))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=False)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
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


def build_planter():
    clear_scene()
    root = new_root("Planter")
    m_wood = mat("Wood", TIMBER_SOFT)
    m_leaf = mat("Leaf", GRASS_DEEP)
    m_flower = mat("Flower", (0.906, 0.510, 0.404, 1.0))
    box(root, "PlanterBox", (0.52, 0.38, 0.28), (0, 0, 0.14), m_wood)
    for i, (x, y, z, height) in enumerate([(-0.14, -0.04, 0.43, 0.30), (0.02, 0.04, 0.49, 0.42), (0.16, -0.03, 0.45, 0.34)]):
        sphere(root, f"Leaf_{i}", 0.12, (x, y, z), m_leaf, scale=(0.78, 0.78, height / 0.12))
        sphere(root, f"Flower_{i}", 0.07, (x + 0.025, y, z + height * 0.35), m_flower, scale=(1, 1, 0.82))
    export_root(root, "prop-planter-01.glb")


def build_laundry():
    clear_scene()
    root = new_root("Laundry")
    m_post = mat("Post", TIMBER_SOFT)
    m_line = mat("Line", (0.416, 0.400, 0.376, 1.0))
    for x in (-0.68, 0.68):
        cylinder(root, f"Post_{x}", 0.05, 1.55, (x, 0, 0.775), m_post, verts=6)
    box(root, "Line", (1.38, 0.03, 0.03), (0, 0, 1.42), m_line)
    for i, (x, colour, height) in enumerate([
        (-0.35, (0.847, 0.365, 0.404, 1.0), 0.34),
        (0.0, (0.961, 0.745, 0.306, 1.0), 0.40),
        (0.35, (0.247, 0.553, 0.624, 1.0), 0.31),
    ]):
        plane(root, f"Cloth_{i}", (0.24, height), (x, 0.025, 1.42 - height * 0.5), mat(f"ClothMaterial_{i}", colour))
    export_root(root, "prop-laundry-01.glb")


def build_harbour_warehouse():
    clear_scene()
    root = new_root("HarbourWarehouse")
    m_brick = mat("Brick", ROSE_BRICK)
    m_roof = mat("Roof", (0.188, 0.306, 0.333, 1.0))
    m_timber = mat("Timber", TIMBER)
    m_glass = mat("Glass", GLASS)
    m_door = mat("Door", DOOR)
    m_canopy = mat("Canopy", (0.827, 0.706, 0.427, 1.0))
    body_h, depth = 2.05, 2.25
    box(root, "WarehouseBody", (3.5, depth, body_h), (0, 0, body_h * 0.5), m_brick)
    gable_roof(root, "WarehouseRoof", 3.78, 2.48, 0.92, body_h, m_roof)
    front = depth * 0.5 + 0.03
    plane(root, "LoadingDoor", (1.12, 1.24), (-0.72, front, 0.62), m_door)
    for x in (0.52, 1.2):
        box(root, f"WindowFrame_{x}", (0.44, 0.07, 0.54), (x, front, 1.15), m_timber)
        plane(root, f"Window_{x}", (0.32, 0.4), (x, front + 0.05, 1.15), m_glass)
    box(root, "LoadingCanopy", (1.42, 0.48, 0.12), (-0.72, front + 0.22, 1.46), m_canopy)
    box(root, "Chimney", (0.24, 0.26, 0.7), (1.18, -0.24, 2.55), mat("ChimneyBrick", DARK_BRICK))
    export_root(root, "harbour-warehouse-01.glb")


def build_harbour_crane():
    clear_scene()
    root = new_root("HarbourCrane")
    m_orange = mat("PaintedMetal", (0.835, 0.490, 0.302, 1.0))
    m_iron = mat("Iron", (0.161, 0.294, 0.318, 1.0))
    m_brass = mat("HookBrass", (0.851, 0.702, 0.365, 1.0))
    cylinder(root, "Base", 0.48, 0.24, (0, 0, 0.12), m_iron, verts=8)
    box(root, "Mast", (0.25, 0.25, 4.1), (0, 0, 2.05), m_orange)
    box(root, "Arm", (3.4, 0.18, 0.18), (-1.35, 0, 3.82), m_orange)
    for i, (x, z, rotation) in enumerate([(-0.55, 2.1, -0.52), (0.56, 2.3, 0.42)]):
        brace = box(root, f"Brace_{i}", (0.12, 0.12, 2.05), (x, 0, z), m_orange)
        brace.rotation_euler[1] = rotation
    cylinder(root, "Cable", 0.028, 1.18, (-2.44, 0, 3.18), m_iron, verts=6)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.15, minor_radius=0.035, major_segments=9, minor_segments=5, location=(-2.44, 0, 2.53), rotation=(math.pi / 2, 0, 0))
    hook = bpy.context.active_object
    hook.name = "Hook"
    hook.data.materials.append(m_brass)
    parent(hook, root)
    export_root(root, "harbour-crane-01.glb")


def build_harbour_repair_workshop():
    clear_scene()
    root = new_root("RepairWorkshop")
    m_brick = mat("Brick", (0.722, 0.404, 0.314, 1.0))
    m_slate = mat("Slate", (0.188, 0.298, 0.329, 1.0))
    m_timber = mat("Timber", TIMBER)
    m_door = mat("Door", DOOR)
    m_glass = mat("Glass", GLASS)
    body_h, depth = 1.65, 1.85
    box(root, "WorkshopBody", (2.5, depth, body_h), (0, 0, body_h * 0.5), m_brick)
    gable_roof(root, "WorkshopRoof", 2.72, 2.08, 0.76, body_h, m_slate)
    front = depth * 0.5 + 0.03
    plane(root, "WorkshopDoor", (0.92, 1.06), (-0.25, front, 0.55), m_door)
    box(root, "WindowFrame", (0.52, 0.07, 0.56), (0.8, front, 1.12), m_timber)
    plane(root, "Window", (0.4, 0.42), (0.8, front + 0.05, 1.12), m_glass)
    box(root, "Awning", (1.38, 0.46, 0.12), (-0.22, front + 0.22, 1.3), mat("Awning", (0.827, 0.647, 0.392, 1.0)))
    cylinder(root, "RepairBarrel", 0.22, 0.5, (1.18, 0.76, 0.25), mat("Barrel", (0.541, 0.353, 0.235, 1.0)), verts=7)
    export_root(root, "harbour-repair-workshop-01.glb")


def build_harbour_repair_boat():
    clear_scene()
    root = new_root("RepairBoat")
    m_hull = mat("Hull", CREAM)
    m_timber = mat("Timber", TIMBER)
    m_slate = mat("Cockpit", (0.188, 0.298, 0.329, 1.0))
    m_patch = mat("RepairPatch", (0.827, 0.545, 0.310, 1.0))
    box(root, "Hull", (2.28, 0.92, 0.5), (0, 0, 0.42), m_hull)
    box(root, "Keel", (2.4, 0.38, 0.12), (0, 0, 0.2), m_timber)
    box(root, "Gunwale", (2.42, 1.06, 0.11), (0, 0, 0.7), m_timber)
    box(root, "Cockpit", (0.78, 0.64, 0.24), (0.22, 0, 0.83), m_slate)
    cylinder(root, "Mast", 0.052, 1.45, (-0.5, 0, 1.28), m_timber, verts=5)
    box(root, "Boom", (0.84, 0.05, 0.05), (-0.14, 0, 1.56), m_timber)
    plane(root, "RepairPatch", (0.48, 0.38), (1.15, 0.49, 0.52), m_patch)
    export_root(root, "harbour-repair-boat-01.glb")


def build_harbour_tidehouse():
    clear_scene()
    root = new_root("Tidehouse")
    m_brick = mat("Brick", (0.682, 0.384, 0.294, 1.0))
    m_slate = mat("Slate", (0.192, 0.310, 0.337, 1.0))
    m_timber = mat("Timber", TIMBER)
    m_door = mat("Door", DOOR)
    m_glass = mat("Glass", GLASS)
    body_h, depth = 1.68, 1.72
    box(root, "TidehouseBody", (2.22, depth, body_h), (0, 0, body_h * 0.5), m_brick)
    gable_roof(root, "TidehouseRoof", 2.44, 1.94, 0.74, body_h, m_slate)
    front = depth * 0.5 + 0.03
    plane(root, "Door", (0.58, 0.94), (-0.4, front, 0.5), m_door)
    box(root, "WindowFrame", (0.58, 0.07, 0.62), (0.46, front, 1.0), m_timber)
    plane(root, "Window", (0.44, 0.48), (0.46, front + 0.05, 1.0), m_glass)
    box(root, "Chimney", (0.2, 0.22, 0.58), (0.64, -0.2, 2.15), mat("Chimney", DARK_BRICK))
    export_root(root, "harbour-tidehouse-01.glb")


def build_harbour_net_rack():
    clear_scene()
    root = new_root("NetRack")
    m_timber = mat("Timber", TIMBER)
    m_canvas = mat("Canvas", (0.843, 0.812, 0.659, 1.0))
    for x in (-0.84, 0.84):
        box(root, f"Post_{x}", (0.1, 0.1, 1.62), (x, 0, 0.81), m_timber)
    box(root, "Crossbar", (1.88, 0.09, 0.09), (0, 0, 1.42), m_timber)
    for i, (x, colour) in enumerate([(-0.48, (0.843, 0.784, 0.435, 1.0)), (0, (0.365, 0.608, 0.627, 1.0)), (0.48, (0.843, 0.784, 0.435, 1.0))]):
        plane(root, f"Net_{i}", (0.34, 0.7), (x, 0.045, 0.9), mat(f"NetMaterial_{i}", colour))
    box(root, "Awning", (2.1, 0.72, 0.1), (0, -0.12, 1.58), m_canvas)
    export_root(root, "harbour-net-rack-01.glb")


def build_harbour_tide_shed():
    clear_scene()
    root = new_root("TideShed")
    m_timber = mat("Timber", (0.459, 0.333, 0.259, 1.0))
    m_slate = mat("Slate", (0.235, 0.333, 0.349, 1.0))
    m_door = mat("Door", (0.161, 0.294, 0.322, 1.0))
    m_board = mat("Tideboard", (0.843, 0.812, 0.659, 1.0))
    m_rope = mat("Rope", (0.780, 0.706, 0.549, 1.0))
    body_h, depth = 1.32, 1.14
    box(root, "TideShedBody", (1.62, depth, body_h), (0, 0, body_h * 0.5), m_timber)
    gable_roof(root, "TideShedRoof", 1.88, 1.38, 0.58, body_h, m_slate)
    front = depth * 0.5 + 0.03
    plane(root, "Door", (0.58, 0.82), (-0.28, front, 0.45), m_door)
    plane(root, "Tideboard", (0.32, 0.7), (0.48, front + 0.01, 0.74), m_board)
    for i, z in enumerate((0.54, 0.72, 0.90)):
        box(root, f"TideTick_{i}", (0.15, 0.035, 0.025), (0.48, front + 0.03, z), m_rope)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.19, minor_radius=0.045, major_segments=10, minor_segments=6, location=(0.76, front + 0.03, 0.27), rotation=(math.pi / 2, 0, 0))
    coil = bpy.context.active_object
    coil.name = "RopeCoil"
    coil.data.materials.append(m_rope)
    parent(coil, root)
    export_root(root, "harbour-tide-shed-01.glb")


def build_moonhill_observatory():
    clear_scene()
    root = new_root("MoonhillObservatory")
    m_stone = mat("Stone", (0.851, 0.835, 0.749, 1.0))
    m_slate = mat("Slate", (0.259, 0.298, 0.459, 1.0))
    m_timber = mat("Timber", TIMBER)
    m_door = mat("Door", DOOR)
    m_glass = mat("Glass", GLASS)
    cylinder(root, "ObservatoryBase", 2.15, 1.7, (0, 0, 0.85), m_stone, verts=10)
    hemisphere(root, "ObservatoryDome", 2.18, (0, 0, 1.72), m_slate)
    # The lower half is hidden inside the cylindrical base after the local lift.
    box(root, "StudyWing", (1.25, 1.22, 1.05), (-1.65, -0.2, 0.525), m_stone)
    gable_roof(root, "StudyRoof", 1.42, 1.4, 0.52, 1.05, m_slate, cx=-1.65, cy=-0.2)
    plane(root, "Door", (0.72, 1.05), (0, 2.18, 0.58), m_door)
    box(root, "WindowFrame", (0.56, 0.07, 0.64), (-1.65, 0.43, 0.7), m_timber)
    plane(root, "Window", (0.42, 0.48), (-1.65, 0.47, 0.7), m_glass)
    slit = box(root, "DomeSlit", (0.14, 0.10, 0.62), (0.2, 0.82, 3.12), mat("BrassSlit", (0.851, 0.780, 0.467, 1.0)))
    slit.rotation_euler[1] = -0.22
    export_root(root, "moonhill-observatory-01.glb")


def build_moonhill_telescope():
    clear_scene()
    root = new_root("MoonhillTelescope")
    m_violet = mat("Violet", (0.427, 0.357, 0.541, 1.0))
    m_metal = mat("PaleMetal", (0.851, 0.827, 0.914, 1.0))
    m_brass = mat("Brass", (0.788, 0.643, 0.404, 1.0))
    m_lens = mat("Lens", (0.529, 0.459, 0.737, 1.0))
    cylinder(root, "Pedestal", 0.3, 1.18, (0, 0, 0.59), m_violet, verts=7)
    cradle = box(root, "Cradle", (0.64, 0.38, 0.15), (0.3, 0, 1.22), m_brass)
    cradle.rotation_euler[1] = math.pi / 3.1
    tube = cylinder(root, "TelescopeTube", 0.22, 2.2, (0.68, 0, 1.5), m_metal, verts=8)
    tube.rotation_euler[1] = math.pi / 3.1
    sphere(root, "Lens", 0.22, (1.28, 0, 1.94), m_lens, scale=(1, 0.84, 1))
    export_root(root, "moonhill-telescope-01.glb")


def build_moonhill_skyhouse():
    clear_scene()
    root = new_root("Skyhouse")
    m_wall = mat("Wall", (0.408, 0.475, 0.467, 1.0))
    m_slate = mat("Slate", (0.239, 0.286, 0.427, 1.0))
    m_timber = mat("Timber", TIMBER)
    m_brass = mat("Brass", (0.788, 0.647, 0.400, 1.0))
    m_door = mat("Door", DOOR)
    m_glass = mat("Glass", GLASS)
    body_h, depth = 1.45, 1.48
    box(root, "SkyhouseBody", (1.9, depth, body_h), (0, 0, body_h * 0.5), m_wall)
    gable_roof(root, "SkyhouseRoof", 2.14, 1.72, 0.74, body_h, m_slate)
    front = depth * 0.5 + 0.03
    plane(root, "Door", (0.58, 0.88), (-0.3, front, 0.47), m_door)
    box(root, "WindowFrame", (0.5, 0.07, 0.54), (0.43, front, 0.94), m_timber)
    plane(root, "Window", (0.36, 0.4), (0.43, front + 0.05, 0.94), m_glass)
    cylinder(root, "VanePost", 0.04, 0.92, (0.15, 0, 2.0), m_brass, verts=5)
    vane = box(root, "WeatherVane", (0.76, 0.09, 0.045), (0.15, 0, 2.38), m_brass)
    vane.rotation_euler[2] = -0.32
    export_root(root, "moonhill-skyhouse-01.glb")


def build_moonhill_moon_dial():
    clear_scene()
    root = new_root("MoonDial")
    m_stone = mat("Stone", (0.851, 0.827, 0.741, 1.0))
    m_face = mat("Face", (0.894, 0.875, 0.773, 1.0))
    m_brass = mat("Brass", (0.788, 0.647, 0.404, 1.0))
    cylinder(root, "DialBase", 0.86, 0.2, (0, 0, 0.1), m_stone, verts=10)
    cylinder(root, "DialFace", 0.62, 0.06, (0, 0, 0.23), m_face, verts=10)
    bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=0.08, radius2=0.0, depth=0.76, location=(0, 0, 0.61))
    gnomon = bpy.context.active_object
    gnomon.name = "Gnomon"
    gnomon.rotation_euler[1] = -0.28
    gnomon.data.materials.append(m_brass)
    parent(gnomon, root)
    for i, angle in enumerate((0, math.pi / 2, math.pi, math.pi * 1.5)):
        box(root, f"Marker_{i}", (0.09, 0.23, 0.05), (math.sin(angle) * 0.43, math.cos(angle) * 0.43, 0.29), m_brass)
    export_root(root, "moonhill-moon-dial-01.glb")


def build_moonhill_almanac_pavilion():
    clear_scene()
    root = new_root("AlmanacPavilion")
    m_wall = mat("Wall", (0.396, 0.467, 0.459, 1.0))
    m_slate = mat("Slate", (0.255, 0.302, 0.443, 1.0))
    m_brass = mat("Brass", (0.788, 0.647, 0.404, 1.0))
    m_door = mat("Door", DOOR)
    body_h, depth = 1.28, 1.34
    box(root, "PavilionBody", (1.7, depth, body_h), (0, 0, body_h * 0.5), m_wall)
    gable_roof(root, "PavilionRoof", 1.94, 1.58, 0.68, body_h, m_slate)
    plane(root, "OpenDoor", (0.52, 0.76), (-0.3, depth * 0.5 + 0.03, 0.42), m_door)
    cylinder(root, "VanePost", 0.04, 0.92, (0, 0, 2.0), m_brass, verts=5)
    box(root, "WeatherVane", (0.72, 0.08, 0.05), (0, 0, 2.35), m_brass)
    export_root(root, "moonhill-almanac-pavilion-01.glb")


def build_moonhill_star_archive():
    clear_scene()
    root = new_root("StarArchive")
    m_wall = mat("Wall", (0.431, 0.486, 0.478, 1.0))
    m_slate = mat("Slate", (0.251, 0.298, 0.447, 1.0))
    m_timber = mat("Timber", (0.400, 0.314, 0.278, 1.0))
    m_door = mat("Door", (0.192, 0.310, 0.349, 1.0))
    m_glass = mat("Glass", GLASS)
    m_star = mat("Star", (0.831, 0.714, 0.412, 1.0))
    body_h, depth = 1.38, 1.44
    box(root, "ArchiveBody", (1.78, depth, body_h), (0, 0, body_h * 0.5), m_wall)
    gable_roof(root, "ArchiveRoof", 2.04, 1.64, 0.63, body_h, m_slate)
    front = depth * 0.5 + 0.03
    plane(root, "Door", (0.54, 0.86), (-0.32, front, 0.46), m_door)
    box(root, "StarWindowFrame", (0.48, 0.07, 0.50), (0.43, front, 0.9), m_timber)
    plane(root, "StarWindow", (0.34, 0.36), (0.43, front + 0.05, 0.9), m_glass)
    sphere(root, "StarWindowMark", 0.07, (0.43, front + 0.08, 0.9), m_star, scale=(1, 0.45, 1))
    box(root, "RecordBox", (0.38, 0.30, 0.26), (0.7, front + 0.03, 0.13), m_timber)
    export_root(root, "moonhill-star-archive-01.glb")


def build_moonhill_orrery():
    clear_scene()
    root = new_root("MoonhillOrrery")
    m_stone = mat("Stone", (0.663, 0.635, 0.580, 1.0))
    m_brass = mat("Brass", (0.784, 0.639, 0.388, 1.0))
    m_sun = mat("Sun", (0.941, 0.839, 0.455, 1.0))
    m_moon = mat("Moon", (0.847, 0.890, 0.875, 1.0))
    cylinder(root, "Plinth", 0.52, 0.68, (0, 0, 0.34), m_stone, verts=8)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.72, minor_radius=0.045, major_segments=16, minor_segments=6, location=(0, 0, 1.0), rotation=(math.pi / 2.8, 0, 0))
    outer = bpy.context.active_object
    outer.name = "OrbitOuter"
    outer.data.materials.append(m_brass)
    parent(outer, root)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.5, minor_radius=0.04, major_segments=14, minor_segments=6, location=(0, 0, 1.0), rotation=(0, math.pi / 2.7, 0))
    inner = bpy.context.active_object
    inner.name = "OrbitInner"
    inner.data.materials.append(m_brass)
    parent(inner, root)
    sphere(root, "Sun", 0.14, (0, 0, 1.0), m_sun)
    sphere(root, "Moon", 0.08, (0.61, 0, 1.14), m_moon)
    export_root(root, "moonhill-orrery-01.glb")


def build_character(filename: str, player: bool):
    """Original low-poly walker with named parts for runtime coat/hat styling."""
    clear_scene()
    root = new_root("Player" if player else "Townsperson")
    m_skin = mat("Skin", SKIN)
    m_coat = mat("Coat", COAT if player else (0.823, 0.373, 0.294, 1.0))
    m_hair = mat("Hair", HAIR)
    m_hat = mat("Hat", HAT)
    m_leg = mat("Leg", (0.165, 0.200, 0.220, 1.0))
    m_sock = mat("Sock", SOCK)
    m_shoe = mat("Shoe", SHOE)
    m_bag = mat("Bag", BAG)

    box(root, "Hips", (0.42, 0.28, 0.18), (0, 0, 0.48), m_leg)
    for side in (-1, 1):
        cylinder(root, f"LegThigh_{side}", 0.105, 0.32, (side * 0.12, 0.02, 0.34), m_leg, verts=7)
        cylinder(root, f"LegCalf_{side}", 0.088, 0.28, (side * 0.12, 0.03, 0.14), m_leg, verts=7)
        cylinder(root, f"Sock_{side}", 0.084, 0.12, (side * 0.12, 0.04, 0.08), m_sock, verts=7)
        box(root, f"Shoe_{side}", (0.15, 0.26, 0.09), (side * 0.12, 0.07, 0.035), m_shoe)

    cylinder(root, "CoatTorso", 0.30, 0.58, (0, 0, 0.82), m_coat, verts=9)
    box(root, "CoatShoulders", (0.72, 0.32, 0.16), (0, 0, 1.05), m_coat)
    # Two short coat tails create a recognisable back silhouette at street scale.
    box(root, "CoatTailLeft", (0.18, 0.12, 0.34), (-0.15, -0.09, 0.56), m_coat, rot_z=-0.10)
    box(root, "CoatTailRight", (0.18, 0.12, 0.34), (0.15, -0.09, 0.56), m_coat, rot_z=0.10)
    for side in (-1, 1):
        upper = cylinder(root, f"CoatUpperArm_{side}", 0.08, 0.32, (side * 0.36, 0, 0.88), m_coat, verts=7)
        upper.rotation_euler[1] = side * 0.20
        lower = cylinder(root, f"CoatLowerArm_{side}", 0.07, 0.28, (side * 0.42, 0.02, 0.59), m_coat, verts=7)
        lower.rotation_euler[1] = side * 0.12
        sphere(root, f"Hand_{side}", 0.075, (side * 0.44, 0.04, 0.42), m_skin, scale=(1, 0.9, 1))

    cylinder(root, "Neck", 0.09, 0.10, (0, 0, 1.18), m_skin, verts=7)
    sphere(root, "Head", 0.23, (0, 0, 1.38), m_skin, scale=(1, 0.92, 1.05))
    if player:
        sphere(root, "HairBack", 0.265, (0, -0.035, 1.47), m_hair, scale=(1.08, 0.92, 1.08))
        box(root, "HairFringe", (0.40, 0.14, 0.12), (0, 0.18, 1.43), m_hair)
        for side in (-1, 1):
            sphere(root, f"HairSide_{side}", 0.12, (side * 0.20, 0.01, 1.32), m_hair, scale=(1, 0.9, 1.18))
        # A small folded map gives the player a journey-specific silhouette.
        box(root, "BagMap", (0.18, 0.05, 0.22), (-0.37, 0.08, 0.63), m_bag, rot_z=-0.18)
    else:
        cylinder(root, "HatBrim", 0.34, 0.05, (0, 0, 1.54), m_hat, verts=12)
        cylinder(root, "HatCrown", 0.21, 0.20, (0, 0, 1.66), m_hat, verts=12)
    box(root, "BagBody", (0.26, 0.14, 0.36), (0.30, 0.10, 0.88), m_bag)
    strap = box(root, "BagStrap", (0.05, 0.04, 0.58), (0.14, 0.04, 1.12), m_bag, rot_z=-0.55)
    export_root(root, filename)


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
        ("planter", build_planter),
        ("laundry", build_laundry),
        ("harbour-warehouse", build_harbour_warehouse),
        ("harbour-crane", build_harbour_crane),
        ("harbour-repair-workshop", build_harbour_repair_workshop),
        ("harbour-repair-boat", build_harbour_repair_boat),
        ("harbour-tidehouse", build_harbour_tidehouse),
        ("harbour-net-rack", build_harbour_net_rack),
        ("harbour-tide-shed", build_harbour_tide_shed),
        ("moonhill-observatory", build_moonhill_observatory),
        ("moonhill-telescope", build_moonhill_telescope),
        ("moonhill-skyhouse", build_moonhill_skyhouse),
        ("moonhill-moon-dial", build_moonhill_moon_dial),
        ("moonhill-almanac-pavilion", build_moonhill_almanac_pavilion),
        ("moonhill-star-archive", build_moonhill_star_archive),
        ("moonhill-orrery", build_moonhill_orrery),
        ("player", lambda: build_character("char-player.glb", player=True)),
        ("npc", lambda: build_character("char-npc.glb", player=False)),
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
