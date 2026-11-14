"""Сцена участка прогулки в Blender: рельеф HiRISE, Солнце, рендеры от первого лица, GLB.

Запускается ВНУТРИ Blender, его собственным Python. pip, GDAL, rasterio не нужны:
на вход идёт готовый пакет участка из frontend/public/data/local/<участок>/
(height.png + ortho.webp + manifest.json), он уже лежит в репозитории.

    blender --background --python backend/scripts/blender/site_scene.py -- \
        --site gale-boxwork --sun sites/gale_day.json

Система координат (совпадает со сценой прогулки на сайте):
    1 единица = 1 м, X — восток, Y — север, Z — высота над base_m из манифеста,
    начало — центр участка. Экспорт glTF (Y вверх) даёт ровно систему walkScene.ts.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

MARS_R = 3396190.0
EYE_HEIGHT_M = 1.7
# Вертикальный угол обзора камеры прогулки (THREE.PerspectiveCamera(70, ...)).
WALK_VFOV_DEG = 70.0
# Перевод освещённости у поверхности (Вт/м²) в силу Sun в Blender. Художественная
# калибровка под AgX: ~290 Вт/м² (Гейл, tau 0,5, Солнце 57°) → ~3,5.
SUN_STRENGTH_PER_WM2 = 0.012
MARS_TINT = (1.0, 0.62, 0.40, 1.0)
SKY_DAY = (0.86, 0.52, 0.30, 1.0)

REPO = Path(__file__).resolve().parents[3]
DEFAULT_PACKAGES = REPO / "frontend" / "public" / "data" / "local"
DEFAULT_OUT = REPO / "data" / "blender"


# ---------- аргументы ----------


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="site_scene.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--site", required=True, help="id участка: gale-boxwork, ares3, jezero (папка в --packages)")
    p.add_argument("--packages", type=Path, default=DEFAULT_PACKAGES, help="папка с пакетами участков")
    p.add_argument("--out", type=Path, default=None, help="куда класть результат (по умолчанию data/blender/<site>/)")
    p.add_argument("--sun", type=Path, default=None, help="JSON с Солнцем (sun_dir_enu, sun_strength_wm2, is_night, ...)")
    p.add_argument("--sun-el", type=float, default=None, help="высота Солнца, градусы (если нет --sun)")
    p.add_argument("--sun-az", type=float, default=None, help="азимут Солнца от севера по часовой, градусы")
    p.add_argument("--sky-hdr", type=Path, default=None, help="HDR неба (equirect), для ночи")
    p.add_argument("--step", type=int, default=1, help="шаг сетки рендера в пикселях height.png (1 = полное разрешение)")
    p.add_argument("--vexag", type=float, default=1.0, help="вертикальное преувеличение; для прогулки только 1")
    p.add_argument("--headings", default="auto", help="курсы камеры через запятую, градусы; auto — поперёк Солнца")
    p.add_argument("--engine", choices=["cycles", "eevee"], default="cycles")
    p.add_argument("--samples", type=int, default=64)
    p.add_argument("--res", default="1920x1080")
    p.add_argument("--no-render", action="store_true", help="только собрать .blend и GLB")
    p.add_argument("--glb-step", type=int, default=4, help="шаг сетки GLB в пикселях (4 × 2 м = 8 м)")
    p.add_argument("--glb-texture", type=int, default=2048, help="размер текстуры в GLB, px")
    p.add_argument("--no-glb", action="store_true")
    p.add_argument("--backdrop", type=Path, default=None,
                   help="обзорная модель вокруг участка (например galecode.glb): горизонт, стены кратера")
    p.add_argument("--backdrop-calib", type=Path, default=None,
                   help="калибровка подложки; по умолчанию backend/scripts/blender/backdrops/<имя>.json")
    p.add_argument("--backdrop-feather-km", type=float, default=4.0, help="ширина плавного перехода к HiRISE, км")
    p.add_argument("--backdrop-glb-step", type=int, default=5, help="шаг сетки GLB подложки в узлах (5 × 200 м = 1 км)")
    return p.parse_args(argv)


# ---------- пакет участка ----------


def load_package(folder: Path) -> dict:
    manifest_path = folder / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Нет {manifest_path}. Доступные участки: {[d.name for d in folder.parent.iterdir() if d.is_dir()]}")
    m = json.loads(manifest_path.read_text(encoding="utf-8"))
    h = m["height"]
    img = bpy.data.images.load(str(folder / h["file"]), check_existing=False)
    img.colorspace_settings.name = "Non-Color"
    w, rows = img.size
    if (w, rows) != (h["width"], h["height"]):
        raise SystemExit(f"height.png {w}×{rows}, а в манифесте {h['width']}×{h['height']}")
    px = np.empty(w * rows * img.channels, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(rows, w, img.channels)[::-1]  # Blender хранит снизу вверх, пакет — с северного края
    r = np.rint(px[:, :, 0] * 255).astype(np.int32)
    g = np.rint(px[:, :, 1] * 255).astype(np.int32)
    units = (r << 8) | g
    heights = np.where(units == 0, np.nan, h["base_m"] + (units - 1) * h["step_m"]).astype(np.float64)
    bpy.data.images.remove(img)

    lo, hi = np.nanmin(heights), np.nanmax(heights)
    if abs(lo - h["min_m"]) > 0.05 or abs(hi - h["max_m"]) > 0.05:
        raise SystemExit(f"Высоты не сходятся с манифестом: {lo:.2f}…{hi:.2f} против {h['min_m']}…{h['max_m']}")

    west, south, east, north = m["bounds_eqc_m"]
    kx = math.cos(((south + north) / 2) / MARS_R)
    return {"manifest": m, "heights": heights, "kx": kx, "pixel_m": h["pixel_m"], "folder": folder}


def lonlat_to_local(pkg: dict, lon_east: float, lat: float) -> tuple[float, float]:
    """Как lonLatToLocal в walk/geo.ts, только Y — север (в сцене сайта z — юг)."""
    west, south, east, north = pkg["manifest"]["bounds_eqc_m"]
    lon = ((lon_east + 180) % 360) - 180
    x = MARS_R * math.radians(lon)
    y = MARS_R * math.radians(lat)
    return (x - (west + east) / 2) * pkg["kx"], y - (south + north) / 2


def height_at(pkg: dict, x: float, y: float) -> float:
    """Высота над base_m в локальной точке (ближайший узел сетки)."""
    hts = pkg["heights"]
    rows, cols = hts.shape
    col = x / (pkg["pixel_m"] * pkg["kx"]) + cols / 2 - 0.5
    row = -y / pkg["pixel_m"] + rows / 2 - 0.5
    c = int(min(max(round(col), 0), cols - 1))
    r = int(min(max(round(row), 0), rows - 1))
    return float(hts[r, c] - pkg["manifest"]["height"]["base_m"])


# ---------- рельеф ----------


def build_terrain(pkg: dict, step: int, vexag: float, name: str, material: bpy.types.Material) -> bpy.types.Object:
    hts = pkg["heights"][::step, ::step]
    rows, cols = hts.shape
    full_rows, full_cols = pkg["heights"].shape
    base = pkg["manifest"]["height"]["base_m"]
    dx = pkg["pixel_m"] * pkg["kx"]
    dy = pkg["pixel_m"]

    r_idx = np.arange(0, full_rows, step)
    c_idx = np.arange(0, full_cols, step)
    xs = (c_idx + 0.5 - full_cols / 2) * dx
    ys = -(r_idx + 0.5 - full_rows / 2) * dy
    gx, gy = np.meshgrid(xs, ys)
    valid = ~np.isnan(hts)
    gz = np.where(valid, (hts - base) * vexag, 0.0)

    verts = np.stack([gx, gy, gz], axis=-1).reshape(-1, 3)
    # UV: снимок покрывает ровно те же границы, что и сетка высот.
    u = (c_idx + 0.5) / full_cols
    v = 1.0 - (r_idx + 0.5) / full_rows
    gu, gv = np.meshgrid(u, v)

    i = np.arange(rows * cols).reshape(rows, cols)
    a, b, c, d = i[:-1, :-1], i[:-1, 1:], i[1:, 1:], i[1:, :-1]
    ok = valid[:-1, :-1] & valid[:-1, 1:] & valid[1:, 1:] & valid[1:, :-1]  # NoData не заполняем
    quads = np.stack([a[ok], d[ok], c[ok], b[ok]], axis=-1)  # против часовой при взгляде сверху

    mesh = bpy.data.meshes.new(name)
    mesh.vertices.add(len(verts))
    mesh.vertices.foreach_set("co", verts.astype(np.float32).ravel())
    n = len(quads)
    mesh.loops.add(n * 4)
    mesh.loops.foreach_set("vertex_index", quads.astype(np.int32).ravel())
    mesh.polygons.add(n)
    mesh.polygons.foreach_set("loop_start", np.arange(0, n * 4, 4, dtype=np.int32))
    mesh.polygons.foreach_set("loop_total", np.full(n, 4, dtype=np.int32))
    mesh.polygons.foreach_set("use_smooth", np.ones(n, dtype=bool))
    uv = mesh.uv_layers.new(name="UVMap")
    uvs = np.stack([gu.ravel(), gv.ravel()], axis=-1)[quads.ravel()]
    uv.data.foreach_set("uv", uvs.astype(np.float32).ravel())
    mesh.update(calc_edges=True)
    mesh.validate()
    mesh.materials.append(material)

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def make_material(pkg: dict) -> bpy.types.Material:
    ortho = pkg["manifest"]["ortho"]
    img = bpy.data.images.load(str(pkg["folder"] / ortho["file"]), check_existing=True)
    # HiRISE RED после растяжки — яркость, не sRGB-цвет; как на сайте, без гамма-преобразования.
    img.colorspace_settings.name = "Non-Color"
    mat = bpy.data.materials.new("hirise_ortho_tinted")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Cubic"
    tex.extension = "EXTEND"
    tint = nt.nodes.new("ShaderNodeMix")
    tint.data_type = "RGBA"
    tint.blend_type = "MULTIPLY"
    tint.inputs["Factor"].default_value = 1.0
    tint.inputs["B"].default_value = MARS_TINT
    nt.links.new(tex.outputs["Color"], tint.inputs["A"])
    nt.links.new(tint.outputs["Result"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.95
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


# ---------- свет ----------


def read_sun(args: argparse.Namespace) -> dict:
    if args.sun:
        s = json.loads(args.sun.read_text(encoding="utf-8"))
        e, n, u = s["sun_dir_enu"]
        return {
            "dir": Vector((e, n, u)).normalized(),  # ENU = X восток, Y север, Z вверх
            "el": s["sun_elevation_deg"],
            "az": s["sun_azimuth_deg"],
            "strength_wm2": s.get("sun_strength_wm2", 290.0),
            "angle_deg": s.get("sun_angular_diameter_deg", 0.35),
            "night": bool(s.get("is_night", s["sun_elevation_deg"] <= 0)),
            "tau": s.get("tau"),
            "label": f"{s.get('name', args.sun.stem)}, LTST {s.get('ltst_hours', 0):.1f} ч, UTC {s.get('utc', '?')}",
        }
    if args.sun_el is None or args.sun_az is None:
        raise SystemExit("Нужно --sun file.json или пара --sun-el и --sun-az")
    el, az = math.radians(args.sun_el), math.radians(args.sun_az)
    d = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
    return {"dir": d, "el": args.sun_el, "az": args.sun_az, "strength_wm2": 290.0, "angle_deg": 0.35,
            "night": args.sun_el <= 0, "tau": None, "label": f"Солнце {args.sun_el:.0f}°, аз. {args.sun_az:.0f}°"}


def setup_light(sun: dict, sky_hdr: Path | None) -> None:
    scene = bpy.context.scene
    world = bpy.data.worlds.new("mars_sky")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    if sky_hdr:
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(sky_hdr), check_existing=True)
        nt.links.new(env.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 1.0
    else:
        bg.inputs["Color"].default_value = SKY_DAY
        bg.inputs["Strength"].default_value = 0.02 if sun["night"] else 0.45

    if sun["night"]:
        return
    light = bpy.data.lights.new("Sun", type="SUN")
    light.energy = sun["strength_wm2"] * SUN_STRENGTH_PER_WM2
    light.angle = math.radians(sun["angle_deg"])
    light.color = (1.0, 0.93, 0.82)
    obj = bpy.data.objects.new("Sun", light)
    # Sun светит вдоль своей −Z, поэтому +Z направляем на Солнце.
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = sun["dir"].to_track_quat("Z", "Y")
    scene.collection.objects.link(obj)


# ---------- камеры и рендер ----------


def viewpoints(pkg: dict) -> list[tuple[str, float, float]]:
    pts = []
    for poi in pkg["manifest"].get("pois") or []:
        x, y = lonlat_to_local(pkg, poi["lon_east"], poi["lat"])
        pts.append((poi["id"], x, y))
    if not pts:
        pts.append(("center", 0.0, 0.0))
    return pts


def headings(arg: str, sun: dict) -> list[float]:
    if arg != "auto":
        return [float(h) % 360 for h in arg.split(",") if h.strip()]
    if sun["night"]:
        return [0.0, 180.0]
    return [(sun["az"] + 90) % 360, (sun["az"] - 90) % 360]  # боковой свет лучше всего показывает рельеф


def add_camera(name: str, x: float, y: float, z: float, heading_deg: float) -> bpy.types.Object:
    cam = bpy.data.cameras.new(name)
    cam.sensor_fit = "VERTICAL"
    cam.angle = math.radians(WALK_VFOV_DEG)
    cam.clip_start = 0.1
    cam.clip_end = 6000
    obj = bpy.data.objects.new(name, cam)
    obj.location = (x, y, z)
    # Камера смотрит вдоль −Z; поворот X на 90° — к горизонту, Z — курс (от севера по часовой).
    obj.rotation_euler = (math.radians(90), 0, -math.radians(heading_deg))
    bpy.context.scene.collection.objects.link(obj)
    return obj


def setup_render(args: argparse.Namespace, caption: str) -> None:
    scene = bpy.context.scene
    w, h = (int(v) for v in args.res.lower().split("x"))
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.image_settings.file_format = "PNG"
    if args.engine == "cycles":
        scene.render.engine = "CYCLES"
        scene.cycles.samples = args.samples
        scene.cycles.use_denoising = True
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            for backend in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
                try:
                    prefs.compute_device_type = backend
                    prefs.refresh_devices()
                    if any(d.type == backend for d in prefs.devices):
                        for d in prefs.devices:
                            d.use = True
                        scene.cycles.device = "GPU"
                        break
                except TypeError:
                    continue
        except Exception:
            pass  # остаёмся на CPU
    else:
        scene.render.engine = next(e for e in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE") if e in {i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items})
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    # Подпись прямо на кадре: место, источник, масштаб рельефа.
    r = scene.render
    r.use_stamp = True
    for attr in dir(r):
        if attr.startswith("use_stamp_") and attr not in ("use_stamp_note", "use_stamp_labels"):
            try:
                setattr(r, attr, False)
            except (AttributeError, TypeError):
                pass
    r.use_stamp_note = True
    r.stamp_note_text = caption
    r.stamp_font_size = max(14, h // 50)


# ---------- GLB ----------


def export_glb(pkg: dict, args: argparse.Namespace, out: Path, material: bpy.types.Material) -> Path:
    glb_mat = material.copy()
    glb_mat.name = "hirise_ortho_glb"
    src = next(n for n in glb_mat.node_tree.nodes if n.type == "TEX_IMAGE").image
    small = src.copy()
    small.name = "ortho_glb"
    if max(small.size) > args.glb_texture:
        small.scale(args.glb_texture, args.glb_texture)
    nt = glb_mat.node_tree
    tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE")
    tex.image = small
    # Узел Mix MULTIPLY экспортёр понимает: снимок → baseColorTexture, оттенок → baseColorFactor.

    obj = build_terrain(pkg, args.glb_step, args.vexag, f"{args.site}_glb", glb_mat)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    path = out / f"{args.site}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_image_format="JPEG",
        export_lights=False,
        export_cameras=False,
    )
    bpy.data.objects.remove(obj)
    return path


# ---------- подложка: обзорный рельеф вокруг участка ----------

BACKDROP_DIR = Path(__file__).resolve().parent / "backdrops"
BACKDROP_GAP_M = 3.0  # подложка у края участка на столько ниже HiRISE: без мерцания на стыке
BACKDROP_INNER_DROP_M = 8.0  # узлы под участком прячем глубже


def heights_at(pkg: dict, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """height_at для массивов: высота HiRISE над base_m в ближайшем узле (NaN вне данных)."""
    hts = pkg["heights"]
    rows, cols = hts.shape
    col = np.clip(np.rint(x / (pkg["pixel_m"] * pkg["kx"]) + cols / 2 - 0.5), 0, cols - 1).astype(int)
    row = np.clip(np.rint(-y / pkg["pixel_m"] + rows / 2 - 0.5), 0, rows - 1).astype(int)
    return hts[row, col] - pkg["manifest"]["height"]["base_m"]


def load_backdrop_grid(path: Path) -> tuple[np.ndarray, float, float, float, float]:
    """Импорт GLB и восстановление регулярной сетки: G[строка с юга, столбец с запада], шаги по X и Y, центр."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        raise SystemExit(f"В {path} нет меша")
    src = max(meshes, key=lambda o: len(o.data.vertices))
    co = np.empty(len(src.data.vertices) * 3, dtype=np.float32)
    src.data.vertices.foreach_get("co", co)  # координаты меша, без трансформа узла
    co = co.reshape(-1, 3).astype(np.float64)
    for o in new:
        bpy.data.objects.remove(o)
    n = int(round(math.sqrt(len(co))))
    if n * n != len(co):
        raise SystemExit(f"Подложка {path.name}: {len(co)} вершин — это не квадратная регулярная сетка")
    x0, x1 = co[:, 0].min(), co[:, 0].max()
    y0, y1 = co[:, 1].min(), co[:, 1].max()
    step_x = (x1 - x0) / (n - 1)
    step_y = (y1 - y0) / (n - 1)  # у Езеро шаг по долготе уже сжат на cos(широты)
    i = np.rint((co[:, 0] - x0) / step_x).astype(int)
    k = np.rint((co[:, 1] - y0) / step_y).astype(int)
    g = np.full((n, n), np.nan)
    g[k, i] = co[:, 2]
    if np.isnan(g).any():
        raise SystemExit(f"Подложка {path.name}: сетка с пропусками, калибровка не подходит")
    return g, step_x, step_y, (x0 + x1) / 2, (y0 + y1) / 2


def build_backdrop(pkg: dict, args: argparse.Namespace) -> tuple[dict, bpy.types.Object, dict]:
    calib_path = args.backdrop_calib or BACKDROP_DIR / f"{args.backdrop.stem}.json"
    if not calib_path.exists():
        raise SystemExit(f"Нет калибровки {calib_path}: без неё неизвестны масштаб, место и преувеличение подложки")
    cal = json.loads(calib_path.read_text(encoding="utf-8"))
    g, step_x, step_y, cxu, cyu = load_backdrop_grid(args.backdrop)
    n = g.shape[0]

    # Узлы сетки → широта/долгота (калибровка по MOLA) → локальные метры участка.
    km = cal["horizontal_km_per_unit"]
    clat, clon = cal["center"]["lat"], cal["center"]["lon_east"]
    dx_m = (np.arange(n) - (n - 1) / 2) * step_x * km * 1000.0
    dy_m = (np.arange(n) - (n - 1) / 2) * step_y * km * 1000.0
    DX, DY = np.meshgrid(dx_m, dy_m)  # строки — с юга на север
    lat = clat + np.degrees(DY / MARS_R)
    lon = clon + np.degrees(DX / (MARS_R * math.cos(math.radians(clat))))
    west, south, east, north = pkg["manifest"]["bounds_eqc_m"]
    lon_w = ((lon + 180) % 360) - 180
    X = (MARS_R * np.radians(lon_w) - (west + east) / 2) * pkg["kx"]
    Y = MARS_R * np.radians(lat) - (south + north) / 2
    base = pkg["manifest"]["height"]["base_m"]
    Z = cal["vertical_m_per_unit"] * g + cal["vertical_offset_m"] - base  # рельеф ×1, метры над base_m

    # Шов: у края участка подложка = HiRISE − зазор, дальше плавно к своим высотам.
    rows, cols = pkg["heights"].shape
    hw = cols * pkg["pixel_m"] * pkg["kx"] / 2
    hh = rows * pkg["pixel_m"] / 2
    px, py = np.clip(X, -hw, hw), np.clip(Y, -hh, hh)
    dist = np.hypot(X - px, Y - py)
    feather = args.backdrop_feather_km * 1000.0
    near = dist < feather
    inside = dist == 0
    # Высота подложки в ближайшей точке края: из её же сетки, билинейно.
    def backdrop_z(qx: np.ndarray, qy: np.ndarray) -> np.ndarray:
        qlat = np.degrees((qy + (south + north) / 2) / MARS_R)
        qlon = np.degrees((qx / pkg["kx"] + (west + east) / 2) / MARS_R)
        fi = np.radians(qlon - ((clon + 180) % 360 - 180)) * MARS_R * math.cos(math.radians(clat)) / (km * 1000 * step_x) + (n - 1) / 2
        fk = np.radians(qlat - clat) * MARS_R / (km * 1000 * step_y) + (n - 1) / 2
        i0 = np.clip(np.floor(fi).astype(int), 0, n - 2)
        k0 = np.clip(np.floor(fk).astype(int), 0, n - 2)
        ti, tk = fi - i0, fk - k0
        gg = (g[k0, i0] * (1 - ti) * (1 - tk) + g[k0, i0 + 1] * ti * (1 - tk)
              + g[k0 + 1, i0] * (1 - ti) * tk + g[k0 + 1, i0 + 1] * ti * tk)
        return cal["vertical_m_per_unit"] * gg + cal["vertical_offset_m"] - base
    delta = np.zeros_like(Z)
    edge_h = heights_at(pkg, px[near], py[near])
    delta[near] = np.nan_to_num(edge_h - backdrop_z(px[near], py[near]) - BACKDROP_GAP_M)
    t = np.clip(1 - dist / feather, 0, 1)
    w = t * t * (3 - 2 * t)  # smoothstep
    Z = Z + delta * w
    Z[inside] = heights_at(pkg, X[inside], Y[inside]) - BACKDROP_INNER_DROP_M
    edge_stats = {
        "edge_delta_median_m": float(np.median(delta[near & (dist < 300)])) if (near & (dist < 300)).any() else None,
        "feather_km": args.backdrop_feather_km,
    }

    mat = bpy.data.materials.new("backdrop_overview")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.42, 0.24, 0.14, 1.0)
    bsdf.inputs["Roughness"].default_value = 1.0
    obj = grid_object(f"{args.site}_backdrop", X, Y, Z, ~inside, 1, mat)
    info = {"file": args.backdrop.name, "calibration": calib_path.name, "pixel_m": cal.get("pixel_m"),
            "credit": cal.get("credit"), **edge_stats}
    return {"X": X, "Y": Y, "Z": Z, "keep": ~inside, "mat": mat}, obj, info


def grid_object(name: str, X: np.ndarray, Y: np.ndarray, Z: np.ndarray, keep: np.ndarray, every: int,
                material: bpy.types.Material) -> bpy.types.Object:
    """Меш из регулярной сетки; квадраты, у которых все 4 узла вне keep, выбрасываются."""
    X, Y, Z, keep = X[::every, ::every], Y[::every, ::every], Z[::every, ::every], keep[::every, ::every]
    rows, cols = X.shape
    verts = np.stack([X, Y, Z], axis=-1).reshape(-1, 3)
    i = np.arange(rows * cols).reshape(rows, cols)
    a, b, c, d = i[:-1, :-1], i[:-1, 1:], i[1:, 1:], i[1:, :-1]  # строки идут с юга на север
    ok = keep[:-1, :-1] | keep[:-1, 1:] | keep[1:, 1:] | keep[1:, :-1]
    quads = np.stack([a[ok], b[ok], c[ok], d[ok]], axis=-1)
    mesh = bpy.data.meshes.new(name)
    mesh.vertices.add(len(verts))
    mesh.vertices.foreach_set("co", verts.astype(np.float32).ravel())
    nq = len(quads)
    mesh.loops.add(nq * 4)
    mesh.loops.foreach_set("vertex_index", quads.astype(np.int32).ravel())
    mesh.polygons.add(nq)
    mesh.polygons.foreach_set("loop_start", np.arange(0, nq * 4, 4, dtype=np.int32))
    mesh.polygons.foreach_set("loop_total", np.full(nq, 4, dtype=np.int32))
    mesh.polygons.foreach_set("use_smooth", np.ones(nq, dtype=bool))
    mesh.update(calc_edges=True)
    mesh.validate()
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def export_backdrop_glb(grid: dict, args: argparse.Namespace, out: Path) -> Path:
    obj = grid_object(f"{args.site}_backdrop_glb", grid["X"], grid["Y"], grid["Z"], grid["keep"],
                      args.backdrop_glb_step, grid["mat"])
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    path = out / f"{args.site}_backdrop.glb"
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True, export_yup=True,
                              export_apply=True, export_normals=True, export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=7, export_lights=False, export_cameras=False)
    bpy.data.objects.remove(obj)
    return path


# ---------- main ----------


def main() -> None:
    args = parse_args()
    if args.vexag != 1.0:
        print("ВНИМАНИЕ: --vexag ≠ 1. Для прогулки от первого лица рельеф должен быть в честном масштабе.")
    folder = args.packages / args.site
    out = (args.out or DEFAULT_OUT / args.site).resolve()
    out.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"

    pkg = load_package(folder)
    m = pkg["manifest"]
    dtm = next((s for s in m.get("sources", []) if s["role"] == "dtm"), {})
    sun = read_sun(args)
    material = make_material(pkg)
    terrain = build_terrain(pkg, args.step, args.vexag, args.site, material)
    backdrop_grid, backdrop_info = None, None
    if args.backdrop:
        if args.vexag != 1.0:
            raise SystemExit("Подложка ставится только с --vexag 1")
        backdrop_grid, _, backdrop_info = build_backdrop(pkg, args)
        print(f"Подложка: {backdrop_info}")
    setup_light(sun, args.sky_hdr)

    scale_note = "рельеф ×1" if args.vexag == 1 else f"рельеф ×{args.vexag:g} (преувеличен)"
    caption = (f"{m['title']} · {dtm.get('product', 'HiRISE DTM')} · {dtm.get('credit', 'NASA/JPL/UArizona, USGS')}"
               f" · {scale_note} · снимок тонирован · {sun['label']}")
    if backdrop_info:
        caption += f" · дальний план: обзорный рельеф ~{backdrop_info['pixel_m']} м/пикс, без снимка"
    setup_render(args, caption)

    renders = []
    for vid, x, y in viewpoints(pkg):
        ground = height_at(pkg, x, y)
        if math.isnan(ground):
            print(f"Точка {vid} вне данных рельефа — пропуск")
            continue
        for hdg in headings(args.headings, sun):
            name = f"{args.site}_{vid}_{int(round(hdg)):03d}"
            cam = add_camera(name, x, y, ground * args.vexag + EYE_HEIGHT_M, hdg)
            if backdrop_grid is not None:
                cam.data.clip_end = 300_000  # до противоположной стены кратера
            if not args.no_render:
                scene.camera = cam
                scene.render.filepath = str(out / f"{name}.png")
                bpy.ops.render.render(write_still=True)
                renders.append(f"{name}.png")
                print(f"Рендер: {out / name}.png")

    glb = None
    if not args.no_glb:
        glb = export_glb(pkg, args, out, material)
        print(f"GLB: {glb} ({glb.stat().st_size / 1e6:.1f} МБ)")
        if backdrop_grid is not None:
            bglb = export_backdrop_glb(backdrop_grid, args, out)
            backdrop_info["glb"] = bglb.name
            print(f"GLB подложки: {bglb} ({bglb.stat().st_size / 1e6:.1f} МБ)")

    bpy.ops.wm.save_as_mainfile(filepath=str(out / f"{args.site}.blend"))
    report = {
        "site": args.site,
        "title": m["title"],
        "frame": "1 ед. = 1 м; X восток, Y север, Z = высота − base_m; начало — центр участка (GLB: Y вверх, Z на юг, как walkScene)",
        "base_m": m["height"]["base_m"],
        "vexag": args.vexag,
        "grid_step_m": pkg["pixel_m"] * args.step,
        "glb_grid_step_m": pkg["pixel_m"] * args.glb_step,
        "sun": {k: (list(v) if isinstance(v, Vector) else v) for k, v in sun.items()},
        "renders": renders,
        "glb": glb.name if glb else None,
        "credit": dtm.get("credit"),
        "products": [s.get("product") for s in m.get("sources", [])],
        "tint_note": "HiRISE RED — яркость; цвет тонирован, не естественный",
        "terrain_faces": len(terrain.data.polygons),
        "backdrop": backdrop_info,
    }
    (out / f"{args.site}_scene.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Готово: {out}")


if __name__ == "__main__":
    main()
