# Конвертер GLB с регулярной сеткой высот в пакет участка; ortho — отмывка, не снимок.
import argparse
import json
import math
import struct
from pathlib import Path

import numpy as np
from PIL import Image

SITE_ID = "gale-procedural"
CENTER_LAT = -4.8042
CENTER_LON = 137.4200
BASE_M = -3800.0
STEP_M = 0.001
MARS_R = 3396190.0
CRS = "+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs=True"
LOCAL_DATA = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "local"
DEFAULT_OUT = LOCAL_DATA / SITE_ID
COMPONENT_DTYPES = {5126: "<f4", 5125: "<u4", 5123: "<u2"}
TYPE_WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, version, _length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise SystemExit("Не GLB версии 2")
    offset, doc, blob = 12, None, b""
    while offset < len(data):
        size, kind = struct.unpack_from("<I4s", data, offset)
        chunk = data[offset + 8 : offset + 8 + size]
        if kind == b"JSON":
            doc = json.loads(chunk)
        elif kind == b"BIN\x00":
            blob = chunk
        offset += 8 + size
    if doc is None:
        raise SystemExit("В GLB нет JSON-чанка")
    return doc, blob


def read_accessor(doc: dict, blob: bytes, index: int) -> np.ndarray:
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    width = TYPE_WIDTHS[acc["type"]]
    dtype = np.dtype(COMPONENT_DTYPES[acc["componentType"]])
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = view.get("byteStride") or dtype.itemsize * width
    count = acc["count"]
    item = dtype.itemsize * width
    raw = np.frombuffer(blob, dtype=np.uint8, count=(count - 1) * stride + item, offset=start)
    rows = np.lib.stride_tricks.as_strided(raw, shape=(count, item), strides=(stride, 1))
    return np.ascontiguousarray(rows).view(dtype).reshape(count, width)


def node_scale(doc: dict, mesh_index: int) -> np.ndarray:
    for node in doc.get("nodes", []):
        if node.get("mesh") == mesh_index:
            return np.array(node.get("scale", [1.0, 1.0, 1.0]), dtype=np.float64)
    return np.ones(3)


def regular_grid(pos: np.ndarray) -> tuple[np.ndarray, float]:
    xs = np.unique(np.round(pos[:, 0], 6))
    zs = np.unique(np.round(pos[:, 2], 6))
    if len(xs) * len(zs) != len(pos):
        raise SystemExit(f"Сетка не регулярная: {len(xs)} X x {len(zs)} Z != {len(pos)} вершин")
    steps = np.concatenate([np.diff(xs), np.diff(zs)])
    step = float((xs[-1] - xs[0]) / (len(xs) - 1))
    if np.abs(steps - step).max() > step * 0.01:
        raise SystemExit("Шаг сетки неравномерный")
    order = np.lexsort((pos[:, 0], pos[:, 2]))
    heights = pos[order, 1].reshape(len(zs), len(xs))
    return heights, step


def hillshade(h: np.ndarray, cell: float) -> np.ndarray:
    dz_dy, dz_dx = np.gradient(h, cell)
    slope = np.arctan(np.hypot(dz_dx, dz_dy) * 4.0)
    aspect = np.arctan2(dz_dy, -dz_dx)
    azimuth, altitude = math.radians(315.0), math.radians(35.0)
    lit = np.cos(altitude) * np.sin(slope) * np.cos(azimuth - aspect)
    shade = np.sin(altitude) * np.cos(slope) + lit
    return np.clip(shade, 0.0, 1.0)


def tint(shade: np.ndarray) -> np.ndarray:
    dark = np.array([58, 48, 40], dtype=np.float64)
    light = np.array([196, 170, 138], dtype=np.float64)
    rgb = dark + (light - dark) * shade[..., None]
    return np.clip(rgb, 0, 255).astype(np.uint8)


def build_manifest(cols: int, rows: int, cell_m: float, min_m: float, max_m: float) -> dict:
    size_x, size_y = cell_m * cols, cell_m * rows
    cx, cy = MARS_R * math.radians(CENTER_LON), MARS_R * math.radians(CENTER_LAT)
    hx, hy = size_x / 2, size_y / 2
    dlon = math.degrees(hx / MARS_R)
    dlat = math.degrees(hy / MARS_R)
    return {
        "schema_version": 1,
        "id": SITE_ID,
        "title": "Гейл, детальная модель поверхности (процедурная)",
        "note": (
            "ПРОЦЕДУРНАЯ модель рельефа с шагом 0.13 м, переданная командой проекта; "
            "это НЕ измерение и не продукт HiRISE. Она показывает правдоподобный микрорельеф, "
            "но не реальную поверхность в этой точке. "
            "Опорная высота -3800 м выбрана как правдоподобная для района, не измерена."
        ),
        "crs": CRS,
        "coordinates": "planetocentric latitude, east longitude 0-360",
        "center": {"lat": CENTER_LAT, "lon_east": CENTER_LON},
        "bounds_eqc_m": [
            round(cx - hx, 2),
            round(cy - hy, 2),
            round(cx + hx, 2),
            round(cy + hy, 2),
        ],
        "bounds_lonlat": {
            "west": round(CENTER_LON - dlon, 6),
            "south": round(CENTER_LAT - dlat, 6),
            "east": round(CENTER_LON + dlon, 6),
            "north": round(CENTER_LAT + dlat, 6),
        },
        "size_m": [round(size_x, 2), round(size_y, 2)],
        "height": {
            "file": "height.png",
            "width": cols,
            "height": rows,
            "pixel_m": round(cell_m, 8),
            "encoding": "units=(R<<8)|G; height_m=base_m+(units-1)*step_m; units=0 is NoData",
            "base_m": BASE_M,
            "step_m": STEP_M,
            "min_m": round(min_m, 3),
            "max_m": round(max_m, 3),
            "nodata_fraction": 0.0,
            "vertical_reference": "условная опорная высота (модель, не привязана к areoid)",
            "data_label": "процедурная модель, шаг сетки 0.13 м",
            "rows": "first row is north edge, columns go east",
        },
        "ortho": {
            "file": "ortho.webp",
            "width": cols,
            "height": rows,
            "pixel_m": round(cell_m, 8),
            "value_0": "нет данных",
            "kind": "hillshade",
            "note": "Отмывка рельефа из той же модели высот; это не снимок поверхности.",
        },
        "sources": [
            {
                "role": "model",
                "status": "model",
                "product": "galecode.glb (Blender, материал Mars_Procedural_Code)",
                "credit": "процедурная модель, предоставлена командой проекта",
                "note": "Не измерение. Ortho — отмывка из этой же модели высот, не фотография.",
            }
        ],
        "track": None,
        "generated_by": "backend/scripts/build_site_from_glb.py",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="GLB с сеткой высот в пакет участка")
    parser.add_argument("glb", type=Path)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    doc, blob = read_glb(args.glb)
    primitive = doc["meshes"][0]["primitives"][0]
    pos = read_accessor(doc, blob, primitive["attributes"]["POSITION"]).astype(np.float64)
    pos *= node_scale(doc, 0)
    heights, cell_m = regular_grid(pos)
    rows, cols = heights.shape
    heights = heights - heights.min() + BASE_M

    units = np.round((heights - BASE_M) / STEP_M).astype(np.int64) + 1
    if units.max() > 65535:
        raise SystemExit("Перепад высот не влезает в 16 бит")
    png = np.zeros((rows, cols, 3), dtype=np.uint8)
    png[..., 0] = (units >> 8) & 0xFF
    png[..., 1] = units & 0xFF
    args.out.mkdir(parents=True, exist_ok=True)
    Image.fromarray(png, "RGB").save(args.out / "height.png", optimize=True)
    shaded = Image.fromarray(tint(hillshade(heights, cell_m)), "RGB")
    shaded.save(args.out / "ortho.webp", quality=85, method=6)

    min_m = BASE_M + (int(units.min()) - 1) * STEP_M
    max_m = BASE_M + (int(units.max()) - 1) * STEP_M
    manifest = build_manifest(cols, rows, cell_m, min_m, max_m)
    text = json.dumps(manifest, ensure_ascii=False, indent=1) + "\n"
    (args.out / "manifest.json").write_text(text, encoding="utf-8")
    print(f"{cols}x{rows}, шаг {cell_m:.8f} м, высоты {min_m:.3f}..{max_m:.3f} м")


if __name__ == "__main__":
    main()
