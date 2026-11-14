"""Сборка OBJ-моделей рельефа мест из «Марсианина» (Ares 3 и Ares 4) для Blender.

Источник — HiRISE DTM из каталога USGS STAC (Cloud Optimized GeoTIFF в открытом
S3). Файлы читаются по сети окнами и обзорными уровнями, целиком не скачиваются.

Что делает скрипт:
1. По маске NoData (уровень обзора 1/16) находит наибольший прямоугольник без
   пропусков. Края полосы HiRISE пустые; заливка их минимумом дала бы ложные
   стены, поэтому модель вырезается внутри валидной области.
2. Читает высоты в этом окне с усреднением до шага сетки (по умолчанию 8 м).
3. Берёт ортофото RED в тех же границах как текстуру и строит вторую текстуру —
   гипсометрическую раскраску по высоте.
4. Пишет OBJ (квадратные грани, UV), MTL с материалами `ortho` и `hypso`,
   превью и JSON с параметрами и источником.

Система модели: 1 единица = 1 км; X — на восток, Y — на север, Z — вверх.
Z = (высота − минимум участка) × vexag. Абсолютная высота минимума записана
в JSON (z_min_m, относительно ареоида Марса).

Запуск из backend (нужны rasterio, numpy, pillow, matplotlib —
`pip install -e ".[terrain]"`):
    python scripts/build_martian_obj.py --site all --out ../data/obj
    python scripts/build_martian_obj.py --site ares3 --step-m 4 --vexag 1

Готовые OBJ (десятки МБ) в Git не храним — только этот скрипт.
"""

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from PIL import Image  # noqa: E402
from rasterio.enums import Resampling  # noqa: E402
from rasterio.windows import Window, from_bounds  # noqa: E402

HIRISE = "https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/"
CREDIT = "NASA/JPL/University of Arizona; DTM USGS Astrogeology (CC0-1.0 по STAC item)"
MASK_LEVEL = 16  # уровень обзора для поиска валидной области
MAX_TEXTURE = 8192


@dataclass(frozen=True)
class Site:
    name: str
    title: str
    place: str
    product: str
    dtm_url: str
    ortho_url: str


SITES = {
    "ares3": Site(
        name="ares3_acidalia_hirise",
        title="Ares 3 — Acidalia Planitia (HiRISE DTM)",
        place="Ares 3, Acidalia Planitia: точка, координаты которой Энди Вейр передал HiRISE",
        product="DTEEC_041277_2115_040776_2115_A01",
        dtm_url=HIRISE
        + "ESP_041277_2115_ESP_040776_2115/DTEEC_041277_2115_040776_2115_A01.tif",
        ortho_url=HIRISE + "ESP_041277_2115_ESP_040776_2115/ESP_040776_2115_RED_A_01_ORTHO.tif",
    ),
    "ares4": Site(
        name="ares4_schiaparelli_hirise",
        title="Ares 4 — Schiaparelli (HiRISE DTM)",
        place="Ares 4, дно кратера Скиапарелли (место MAV)",
        product="DTEED_042014_1760_042647_1760_A01",
        dtm_url=HIRISE
        + "ESP_042014_1760_ESP_042647_1760/DTEED_042014_1760_042647_1760_A01.tif",
        ortho_url=HIRISE + "ESP_042014_1760_ESP_042647_1760/ESP_042014_1760_RED_D_01_ORTHO.tif",
    ),
}


def write_obj(z: np.ndarray, px: float, path: Path, material: str, vexag: float) -> None:
    """Сетка высот → OBJ с UV. 1 единица = 1 км."""
    s = 1e-3
    h, w = z.shape
    x, y = np.meshgrid(np.arange(w) * px, np.arange(h)[::-1] * px)
    vertices = np.column_stack([x.ravel() * s, y.ravel() * s, (z.ravel() - z.min()) * vexag * s])
    uv = np.column_stack([(x / x.max()).ravel(), (y / y.max()).ravel()])
    idx = np.arange(h * w).reshape(h, w) + 1
    a, b = idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel()
    c, d = idx[1:, 1:].ravel(), idx[1:, :-1].ravel()
    faces = np.column_stack([a, a, d, d, c, c, b, b])
    with path.open("w") as f:
        f.write(f"mtllib {path.stem}.mtl\no {path.stem}\nusemtl {material}\n")
        np.savetxt(f, vertices, fmt="v %.4f %.4f %.4f")
        np.savetxt(f, uv, fmt="vt %.6f %.6f")
        np.savetxt(f, faces, fmt="f %d/%d %d/%d %d/%d %d/%d")


def largest_valid_rect(mask: np.ndarray) -> tuple[int, int, int, int]:
    """Наибольший прямоугольник из True: (row, col, height, width)."""
    h, w = mask.shape
    heights = np.zeros(w, dtype=int)
    best = (0, 0, 0, 0, 0)
    for r in range(h):
        heights = np.where(mask[r], heights + 1, 0)
        stack: list[tuple[int, int]] = []
        for c in range(w + 1):
            cur = heights[c] if c < w else 0
            start = c
            while stack and stack[-1][1] >= cur:
                s0, hh = stack.pop()
                if hh * (c - s0) > best[0]:
                    best = (hh * (c - s0), r - hh + 1, s0, hh, c - s0)
                start = s0
            stack.append((start, cur))
    return best[1:]


def stretch_to_8bit(img: np.ndarray) -> np.ndarray:
    valid = img[img > 0]
    lo, hi = np.percentile(valid, [0.5, 99.5])
    return np.clip((img - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)


def build(site: Site, out: Path, step_m: float, vexag: float) -> dict:
    with rasterio.open(site.dtm_url) as ds:
        k = MASK_LEVEL
        coarse = ds.read(
            1, out_shape=(ds.height // k, ds.width // k), resampling=Resampling.nearest
        )
        valid = np.isfinite(coarse) & (coarse > -1e30)
        if ds.nodata is not None:
            valid &= coarse != ds.nodata
        r, c, hh, ww = largest_valid_rect(valid)
        # Отступ в одну грубую ячейку: на границе маски возможны частично пустые блоки.
        window = Window((c + 1) * k, (r + 1) * k, (ww - 2) * k, (hh - 2) * k)

        step = max(1, round(step_m / ds.res[0]))
        h, w = int(window.height) // step, int(window.width) // step
        z = ds.read(1, window=window, out_shape=(h, w), resampling=Resampling.average)
        z = z.astype("float64")
        if (~np.isfinite(z) | (z < -1e30)).any():
            raise SystemExit(f"{site.name}: в окне остались NoData, уменьшите область")
        px = ds.res[0] * step
        bounds = rasterio.windows.bounds(window, ds.transform)
        crs = ds.crs.to_proj4()

    th, tw = min(h * 2, MAX_TEXTURE), min(w * 2, MAX_TEXTURE)
    with rasterio.open(site.ortho_url) as ortho:
        img = ortho.read(
            1,
            window=from_bounds(*bounds, transform=ortho.transform),
            out_shape=(th, tw),
            resampling=Resampling.average,
        ).astype("float64")

    out.mkdir(parents=True, exist_ok=True)
    base = out / site.name
    Image.fromarray(stretch_to_8bit(img)).save(f"{base}_ortho.png")
    norm = (z - z.min()) / (z.max() - z.min())
    hypso = (plt.cm.terrain(norm)[..., :3] * 255).astype(np.uint8)
    Image.fromarray(hypso).resize((tw, th), Image.BILINEAR).save(f"{base}_hypso.png")

    with open(f"{base}.mtl", "w") as f:
        for material in ("ortho", "hypso"):
            f.write(
                f"newmtl {material}\nKa 1 1 1\nKd 1 1 1\nKs 0 0 0\nillum 1\n"
                f"map_Kd {site.name}_{material}.png\n\n"
            )
    obj_path = base.with_suffix(".obj")
    write_obj(z, px, obj_path, "ortho", vexag)

    plt.figure(figsize=(6, 6))
    plt.imshow(z, cmap="terrain")
    plt.colorbar(label="высота, м")
    plt.title(site.title)
    plt.savefig(f"{base}_preview.png", dpi=80, bbox_inches="tight")
    plt.close()

    info = {
        "file": obj_path.name,
        "place": site.place,
        "product": site.product,
        "dtm_url": site.dtm_url,
        "ortho_url": site.ortho_url,
        "credit": CREDIT,
        "source_crs": crs,
        "bounds_source_m": [round(v, 1) for v in bounds],
        "grid": [h, w],
        "vertices": h * w,
        "pixel_m": round(px, 2),
        "size_km": [round(w * px / 1000, 2), round(h * px / 1000, 2)],
        "z_min_m": round(float(z.min()), 1),
        "z_max_m": round(float(z.max()), 1),
        "relief_m": round(float(z.max() - z.min()), 1),
        "vexag": vexag,
        "axes": "1 unit = 1 km; X east, Y north, Z up; Z = (height - z_min_m) * vexag",
        "obj_mb": round(obj_path.stat().st_size / 1e6, 1),
    }
    Path(f"{base}.json").write_text(json.dumps(info, ensure_ascii=False, indent=1))
    print(json.dumps(info, ensure_ascii=False))
    return info


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--site", choices=[*SITES, "all"], default="all")
    parser.add_argument("--out", type=Path, default=Path("../data/obj"))
    parser.add_argument("--step-m", type=float, default=8.0, help="шаг сетки, м (≥ разрешения DTM)")
    parser.add_argument("--vexag", type=float, default=2.5, help="вертикальное преувеличение")
    args = parser.parse_args()
    for key in SITES if args.site == "all" else [args.site]:
        build(SITES[key], args.out, args.step_m, args.vexag)


if __name__ == "__main__":
    main()
