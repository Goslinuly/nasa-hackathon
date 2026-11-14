"""Карта высот для объёмного глобуса на главной странице.

Источник — MOLA MEGDR 16 px/° (MEGT90N000EB.IMG, PDS Geosciences Node):
высоты над ареоидом в метрах, 16-бит big-endian, простая цилиндрическая проекция,
первая строка — край 90°N, первый столбец — край 0°E, долгота растёт на восток.

Результат — PNG без цветового профиля, где каждый пиксель кодирует
height_m = ((R << 8) | G) - offset_units) * step_m (канал B = 0). PNG выбран потому,
что браузер декодирует его без потерь; 8-битная яркость дала бы ступени ~115 м.
Рядом пишется JSON с параметрами кодирования, источником и SHA-256 обоих файлов.

Сетка уменьшается усреднением блоков factor×factor. Для глобуса в меню 8 px/°
(~7.4 км/пикс на экваторе) достаточно: мелкие детали показывает текстура
HRSC+MOLA 200 м, а геометрия передаёт крупные формы рельефа.

Запуск (нужны numpy и pillow; исходный IMG не хранится в Git):
    python scripts/build_globe_heightmap.py [путь/к/megt90n000eb.img]
"""

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

SOURCE_URL = (
    "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/"
    "mgsl_300x/meg016/megt90n000eb.img"
)
SOURCE_PPD = 16
SOURCE_SHAPE = (180 * SOURCE_PPD, 360 * SOURCE_PPD)

FACTOR = 2  # 16 px/° -> 8 px/°
STEP_M = 4  # шаг квантования высоты; заметно меньше точности сетки MEGDR
OFFSET_UNITS = 8192  # сдвиг, чтобы отрицательные высоты уместились в uint16

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_PATH = REPO_ROOT / "data" / "raw" / "megt90n000eb.img"
OUT_DIR = REPO_ROOT / "frontend" / "public" / "data" / "globe"
OUT_NAME = "mola_megdr_8ppd_height"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_source(path: Path) -> np.ndarray:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        print(f"Скачиваю {SOURCE_URL}")
        urllib.request.urlretrieve(SOURCE_URL, path)
    heights = np.fromfile(path, dtype=">i2")
    if heights.size != SOURCE_SHAPE[0] * SOURCE_SHAPE[1]:
        raise SystemExit(f"Неожиданный размер {path}: {heights.size} отсчётов")
    return heights.reshape(SOURCE_SHAPE)


def encode(heights: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    rows, cols = heights.shape
    averaged = (
        heights.astype(np.float64)
        .reshape(rows // FACTOR, FACTOR, cols // FACTOR, FACTOR)
        .mean(axis=(1, 3))
    )
    units = np.round(averaged / STEP_M).astype(np.int64) + OFFSET_UNITS
    if units.min() < 0 or units.max() > 0xFFFF:
        raise SystemExit("Высоты не помещаются в 16 бит при выбранном шаге")
    units = units.astype(np.uint16)
    rgb = np.zeros((*units.shape, 3), dtype=np.uint8)
    rgb[..., 0] = units >> 8
    rgb[..., 1] = units & 0xFF
    return rgb, averaged


def main() -> None:
    source_path = Path(sys.argv[1]) if len(sys.argv) > 1 else RAW_PATH
    heights = load_source(source_path)
    rgb, averaged = encode(heights)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    png_path = OUT_DIR / f"{OUT_NAME}.png"
    Image.fromarray(rgb, "RGB").save(png_path, "PNG", optimize=True)

    meta = {
        "encoding": "height_m = (((R << 8) | G) - offset_units) * step_m; B = 0",
        "offset_units": OFFSET_UNITS,
        "step_m": STEP_M,
        "width": rgb.shape[1],
        "height": rgb.shape[0],
        "pixels_per_degree": SOURCE_PPD // FACTOR,
        "first_row_north_edge_lat": 90.0,
        "first_column_west_edge_lon_east": 0.0,
        "longitude": "east, 0-360, increases with column",
        "latitude": "planetocentric",
        "vertical_reference": "MOLA areoid (MEGDR), meters",
        "min_m": round(float(averaged.min()), 1),
        "max_m": round(float(averaged.max()), 1),
        "resampling": f"block mean {FACTOR}x{FACTOR} from {SOURCE_PPD} px/deg",
        "source": {
            "product_id": "MEGT90N000EB.IMG",
            "data_set_id": "MGS-M-MOLA-5-MEGDR-L3-V1.0",
            "url": SOURCE_URL,
            "sha256": sha256(source_path),
            "credit": "NASA/GSFC MOLA Science Team, PDS Geosciences Node",
        },
        "png_sha256": sha256(png_path),
    }
    (OUT_DIR / f"{OUT_NAME}.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"{png_path} ({png_path.stat().st_size / 1e6:.1f} МБ), {rgb.shape[1]}x{rgb.shape[0]}")


if __name__ == "__main__":
    main()
