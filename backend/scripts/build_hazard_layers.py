"""Слои проходимости: уклон MOLA+HRSC 200 м/пикс и тепловая инерция TES как признак грунта."""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from PIL import Image

WMS = "http://ms-mars.mars.asu.edu/TES_TI_Putzig_day_numeric"
OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "hazard"
PPD = 8
WIDTH, HEIGHT = 360 * PPD, 180 * PPD
SLOPE_STEP_DEG = 0.125
TI_STEP = 8.0


def fetch_strip(layer: str, lat_south: float, lat_north: float, rows: int) -> np.ndarray:
    params = (
        "SERVICE=WMS&REQUEST=GetMap&FORMAT=image/vicar"
        f"&WIDTH={WIDTH}&HEIGHT={rows}&SRS=JMARS:4"
        f"&BBOX=0,{format(lat_south, 'g')},360,{format(lat_north, 'g')}"
        f"&STYLES=&VERSION=1.1.1&LAYERS={layer}"
    )
    request = urllib.request.Request(
        f"{WMS}?{params}", headers={"User-Agent": "MartianMap-data-pipeline/0.1"}
    )
    with urllib.request.urlopen(request, timeout=600) as response:
        data = response.read()
    match = re.match(rb"LBLSIZE=(\d+)", data)
    if match is None:
        raise ValueError(f"{layer}: сервис вернул не VICAR ({data[:80]!r})")
    label_size = int(match.group(1))
    head = data[:label_size].decode("ascii", "replace")

    def field(key: str) -> str:
        found = re.search(key + r"=('?)([^' ]+)\1", head)
        if found is None:
            raise ValueError(f"в заголовке VICAR нет {key}")
        return found.group(2)

    kind = {"BYTE": np.uint8, "HALF": "<i2", "FULL": "<i4", "REAL": "<f4"}[field("FORMAT")]
    nl, ns = int(field("NL")), int(field("NS"))
    expected = nl * ns * np.dtype(kind).itemsize
    body = data[label_size : label_size + expected]
    if len(body) != expected:
        raise ValueError(f"полоса неполная: {len(body)} из {expected} байт")
    return np.frombuffer(body, dtype=kind).reshape(nl, ns).astype(np.float32)


def fetch(layer: str, strips: int = 16, attempts: int = 6) -> np.ndarray:
    rows = HEIGHT // strips
    bands = []
    for index in range(strips):
        north = 90.0 - index * (180.0 / strips)
        south = north - (180.0 / strips)
        for attempt in range(attempts):
            try:
                bands.append(fetch_strip(layer, south, north, rows))
                break
            except (ValueError, OSError) as error:
                if attempt == attempts - 1:
                    raise ValueError(f"{layer}: полоса {index} не скачалась: {error}") from None
                time.sleep(5.0 * (attempt + 1))
        print(f"  {layer}: полоса {index + 1} из {strips}", file=sys.stderr)
        time.sleep(1.5)
    return np.vstack(bands)


def encode(values: np.ndarray, step: float, name: str) -> dict:
    units = np.clip(np.rint(values / step), 0, 255).astype(np.uint8)
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(units, mode="L").save(OUT / name, optimize=True)
    return {
        "file": name,
        "width": int(values.shape[1]),
        "height": int(values.shape[0]),
        "step": step,
        "encoding": "значение = пиксель * step",
        "max_encoded": float(255 * step),
    }


def main() -> int:
    slope = fetch("mola_hrsc_blend_slope_v2")
    inertia = fetch("TES_TI_Putzig_day_numeric")
    slope_meta = encode(slope, SLOPE_STEP_DEG, "slope.png")
    inertia_meta = encode(np.clip(inertia, 0, 2040), TI_STEP, "thermal_inertia.png")
    valid_ti = inertia[inertia > 0]
    manifest = {
        "pixels_per_degree": PPD,
        "rows": "строка 0 — северный край, столбцы идут на восток от 0° в. д.",
        "slope": {
            **slope_meta,
            "units": "градусы",
            "source": "MOLA + HRSC blended slope v2, исходное разрешение около 200 м/пикс",
            "status": "measurement",
            "note": (
                "В ячейке сетки 7.4 км хранится уклон, посчитанный на масштабе 200 м: "
                "это признак изрезанности участка, а не уклон под ногами"
            ),
            "observed_max_deg": float(slope.max()),
            "median_deg": float(np.median(slope)),
        },
        "thermal_inertia": {
            **inertia_meta,
            "units": "Дж м^-2 К^-1 с^-1/2",
            "source": "MGS TES, дневная тепловая инерция, Putzig et al. (2005),"
            " сетка 20 пикс/градус",
            "status": "measurement",
            "note": "0 — нет данных; значения выше 1200 обычно лёд и артефакты полярных шапок",
            "median": float(np.median(valid_ti)),
            "nodata_fraction": float((inertia <= 0).mean()),
        },
        "surface_from_inertia": {
            "status": "model",
            "note": (
                "Порог грунта по тепловой инерции: ниже 150 считаем рыхлым песком, "
                "выше — плотным грунтом. Это трактовка измерения, а не доля камней на площади"
            ),
            "sand_below": 150,
        },
        "retrieved": datetime.now(UTC).date().isoformat(),
        "service": WMS,
        "credit": "NASA/JPL/GSFC/ASU; Putzig et al. (2005); ESA/DLR/FU Berlin для HRSC",
    }
    text = json.dumps(manifest, ensure_ascii=False, indent=1)
    (OUT / "hazard.json").write_text(text, encoding="utf-8")
    print(
        f"уклон: медиана {manifest['slope']['median_deg']:.2f}°, максимум "
        f"{manifest['slope']['observed_max_deg']:.1f}°; "
        f"инерция: медиана {manifest['thermal_inertia']['median']:.0f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
