"""Сборка локальных пакетов рельефа для вида от первого лица (docs/TZ_First_Person.md).

Пакет одного участка — папка `frontend/public/data/local/<site>/`:

- `height.png` — высоты HiRISE DTM в 16-битном коде RGB без потерь:
  units = (R << 8) | G; height_m = base_m + (units - 1) * step_m; units = 0 — NoData.
  Канал B — источник высоты: 0 — HiRISE, 1 — заполнение (CTX), 2 — переходная полоса.
  У участков без заполнения B = 0 везде. Браузер декодирует PNG без потерь.
- `ortho.webp` — ортофото HiRISE RED в тех же границах (где HiRISE нет — заполнение CTX).
- `ortho_hi.webp` — детальное окно ортофото в родном разрешении HiRISE (0,25 м, ~1 × 1 км)
  вокруг места старта; та же растяжка яркости, что у `ortho.webp`. Где в окне нет HiRISE,
  альфа-канал 0 и сцена берёт базовый снимок (заполнение CTX в детальное окно не попадает).
- `track.geojson` — путевые точки ровера внутри участка (если есть) с высотой
  DTM под каждой точкой и разницей с высотой из телеметрии ровера.
- `manifest.json` — продукты, CRS, границы, кодирование, кредиты, точки интереса,
  статистика смещения высот трека и SHA-256 файлов.

Исходники читаются по сети окнами (Cloud Optimized GeoTIFF или тайловые GeoTIFF),
целиком не скачиваются.

Запуск из backend (`pip install -e ".[terrain]"`):
    python scripts/build_local_package.py --site all   # высоты 1 м, снимок 0,5 м + окно 0,25 м
    python scripts/build_local_package.py --site gale-boxwork --height-px 2 --no-hi
    python scripts/build_local_package.py --site jezero --hi-center 18.4380,77.2450

Трек ровера по умолчанию берётся из уже собранного `track.geojson` (пересчитываются только
высоты DTM под точками), чтобы пересборка рельефа не меняла набор точек; `--refresh-track`
скачивает путевые точки заново.
"""

import argparse
import hashlib
import json
import math
import urllib.request
from dataclasses import dataclass, field, replace
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import from_bounds as transform_from_bounds
from rasterio.vrt import WarpedVRT
from rasterio.windows import from_bounds

MARS_R = 3396190.0  # радиус сферы в CRS продуктов HiRISE DTM USGS
HIRISE = "https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/"
MSL_WAYPOINTS = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"
M20_WAYPOINTS = "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json"
HIRISE_CREDIT = "NASA/JPL/University of Arizona (HiRISE); DTM USGS Astrogeology"
# Мозаики Mars 2020 TRN (USGS). DTM отдельных стереопар нарезаны тайлами 256×256 (LZW),
# окно из них читается быстро; общая мозаика DTM (1,8 ГБ) хранится полосами — её не трогаем.
TRN = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/"
TRN_HIRISE_CREDIT = ("NASA/JPL/University of Arizona (HiRISE); Mars 2020 TRN HiRISE DTM и "
                     "ортомозаика USGS Astrogeology (Fergason et al., 2020), doi:10.5066/P9REJ9JN")
TRN_CTX_CREDIT = ("NASA/JPL/MSSS (CTX); Mars 2020 TRN CTX DTM и ортомозаика "
                  "USGS Astrogeology, doi:10.5066/P906QQT8")
SRC_HIRISE, SRC_FILL, SRC_BLEND = 0, 1, 2
SRC_NAMES = {SRC_HIRISE: "hirise", SRC_FILL: "fill", SRC_BLEND: "blend"}
OUT_ROOT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "local"


@dataclass(frozen=True)
class Poi:
    id: str
    title: str
    lat: float
    lon_east: float
    note: str


@dataclass(frozen=True)
class Fill:
    """Грубый продукт, которым закрываются места без HiRISE."""
    product: str
    url: str
    credit: str
    pixel_m: float


@dataclass(frozen=True)
class Site:
    id: str
    title: str
    dtm_product: str
    dtm_url: str
    ortho_product: str
    ortho_url: str
    center_lat: float
    center_lon_east: float
    size_m: tuple[float, float]  # ширина (W-E), высота (S-N)
    note: str
    pois: tuple[Poi, ...] = field(default_factory=tuple)
    track_url: str | None = None
    track_mission: str | None = None
    dtm_credit: str = HIRISE_CREDIT
    ortho_credit: str = HIRISE_CREDIT
    license: str = "CC0-1.0 по STAC item"
    # Ортофото в другой проекции (ortho у мозаики TRN) перепроецируется в CRS DTM.
    ortho_warp: bool = False
    dtm_fill: Fill | None = None
    ortho_fill: Fill | None = None
    feather_m: float = 40.0
    quality_note: str | None = None
    # Последний сол трека: метка ровера подписана этим солом, новые точки её бы обогнали.
    track_max_sol: int | None = None


SITES = {
    "gale-boxwork": Site(
        id="gale-boxwork",
        title="Гейл, район boxwork на склоне горы Шарп",
        dtm_product="DTEEC_019698_1750_019988_1750_U01",
        dtm_url=HIRISE
        + "ESP_019698_1750_ESP_019988_1750/DTEEC_019698_1750_019988_1750_U01.tif",
        ortho_product="ESP_019698_1750_RED_A_01_ORTHO",
        ortho_url=HIRISE + "ESP_019698_1750_ESP_019988_1750/ESP_019698_1750_RED_A_01_ORTHO.tif",
        # Центр границ района из TZ_EVA_Safety.md, 2.1 (солы 4540–4845), с запасом по краям.
        center_lat=-4.80421,
        center_lon_east=137.382525,
        size_m=(1800.0, 2400.0),
        note="Демонстрационный выход ТЗ EVA: лагерь A → научная цель Б, 677 м.",
        pois=(
            Poi("A", "Лагерь A", -4.797816, 137.385921,
                "Круговая панорама при первом прибытии Curiosity в boxwork"),
            Poi("B", "Научная цель Б", -4.808271, 137.381270,
                "Круговая панорама с пика кампании; рядом место бурения"),
        ),
        track_url=MSL_WAYPOINTS,
        track_mission="MSL",
    ),
    "ares3": Site(
        id="ares3",
        title="Ares 3, Acidalia Planitia («Марсианин»)",
        dtm_product="DTEEC_041277_2115_040776_2115_A01",
        dtm_url=HIRISE
        + "ESP_041277_2115_ESP_040776_2115/DTEEC_041277_2115_040776_2115_A01.tif",
        ortho_product="ESP_040776_2115_RED_A_01_ORTHO",
        ortho_url=HIRISE + "ESP_041277_2115_ESP_040776_2115/ESP_040776_2115_RED_A_01_ORTHO.tif",
        # Центр снимка ESP_040776_2115, снятого по координатам, которые Энди Вейр передал HiRISE.
        center_lat=31.380,
        center_lon_east=331.371,
        size_m=(2000.0, 2000.0),
        note="Место посадки Ares 3 из романа Энди Вейра; участок вокруг центра снимка.",
        pois=(
            Poi("ares3", "Ares 3", 31.380, 331.371,
                "Центр снимка HiRISE ESP_040776_2115 по координатам автора романа"),
        ),
    ),
    "jezero": Site(
        id="jezero",
        title="Езеро, западный вал кратера: путь Perseverance к солу 2022",
        dtm_product="DTM_MOLAtopography_DeltaGeoid_Jezero_CR_SOUTH_Edited_affine_1m",
        dtm_url=TRN + "HiRISE/DTM_MOLAtopography_DeltaGeoid_Jezero_CR_SOUTH_Edited_affine_1m"
        "_Eqc_latTs0_lon0.tif",
        ortho_product="JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120",
        ortho_url=TRN + "HiRISE/JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif",
        # Между текущей позицией (сол 2022) и подъёмом на вал (солы ~1595–1690).
        center_lat=18.4350,
        center_lon_east=77.2400,
        size_m=(3000.0, 2000.0),
        note="Подъём Perseverance на западный вал кратера Езеро и текущая позиция на сол 2022. "
        "Рельеф 1 м есть только в восточной части; запад, включая текущую позицию, "
        "покрыт лишь CTX 20 м.",
        pois=(
            Poi("rover", "Perseverance, сол 2022", 18.43559434, 77.23322287,
                "Текущая позиция по M20_waypoints_current.json; вне HiRISE DTM, рельеф CTX 20 м"),
        ),
        track_url=M20_WAYPOINTS,
        track_mission="M20",
        track_max_sol=2022,
        dtm_credit=TRN_HIRISE_CREDIT,
        ortho_credit=TRN_HIRISE_CREDIT,
        license="USGS, общественное достояние",
        ortho_warp=True,
        dtm_fill=Fill("JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m",
                      TRN + "CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m"
                      "_Eqc_latTs0_lon0.tif", TRN_CTX_CREDIT, 20.0),
        ortho_fill=Fill("JEZ_ctx_B_soc_008_orthoMosaic_6m",
                        TRN + "CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif",
                        TRN_CTX_CREDIT, 6.0),
        quality_note="HiRISE-часть участка — стереопара CR (Crater Rim), самая западная в "
        "мозаике TRN. Паспорт USGS: «several quality issues due to uncompensated y-parallax "
        "... users should be cautious when using this area for analysis». Подписывать как "
        "зону пониженного качества. Западнее HiRISE DTM нет ни в TRN, ни в PDS: там высоты "
        "CTX 20 м и ортофото CTX 6 м, мелкий рельеф не виден.",
    ),
}


def lonlat_to_eqc(lon_east: float, lat: float) -> tuple[float, float]:
    """Равнопромежуточная проекция продуктов HiRISE DTM USGS (lon_0=0, lat_ts=0)."""
    lon = ((lon_east + 180.0) % 360.0) - 180.0
    return MARS_R * math.radians(lon), MARS_R * math.radians(lat)


def eqc_to_lonlat(x: float, y: float) -> tuple[float, float]:
    return math.degrees(x / MARS_R) % 360.0, math.degrees(y / MARS_R)


def encode_heights(z: np.ndarray, valid: np.ndarray,
                   source: np.ndarray | None = None) -> tuple[np.ndarray, float, float]:
    """Высоты → RGB-код; возвращает (rgb, base_m, step_m). Значение 0 зарезервировано."""
    zmin, zmax = float(z[valid].min()), float(z[valid].max())
    base = math.floor(zmin)
    step = 0.01
    while (zmax - base) / step + 1 > 0xFFFF:
        step *= 2
    units = np.zeros(z.shape, dtype=np.uint16)
    units[valid] = (np.round((z[valid] - base) / step) + 1).astype(np.uint16)
    rgb = np.zeros((*z.shape, 3), dtype=np.uint8)
    rgb[..., 0] = units >> 8
    rgb[..., 1] = units & 0xFF
    if source is not None:
        rgb[..., 2] = np.where(valid, source, 0)
    return rgb, float(base), step


def decode_heights(rgb: np.ndarray, base: float, step: float) -> np.ndarray:
    units = (rgb[..., 0].astype(np.int64) << 8) | rgb[..., 1].astype(np.int64)
    out = base + (units - 1) * step
    return np.where(units == 0, np.nan, out)


def bilinear(z: np.ndarray, col: float, row: float) -> float:
    h, w = z.shape
    if not (0 <= col <= w - 1 and 0 <= row <= h - 1):
        return float("nan")
    c0, r0 = min(int(col), w - 2), min(int(row), h - 2)
    fc, fr = col - c0, row - r0
    top = z[r0, c0] * (1 - fc) + z[r0, c0 + 1] * fc
    bottom = z[r0 + 1, c0] * (1 - fc) + z[r0 + 1, c0 + 1] * fc
    return float(top * (1 - fr) + bottom * fr)


def read_grid(url: str, bounds: tuple, shape: tuple[int, int], crs,
              resampling: Resampling) -> tuple[np.ndarray, np.ndarray, float]:
    """Растр в заданной сетке через WarpedVRT: (значения, маска валидных, исходный пиксель)."""
    h, w = shape
    transform = transform_from_bounds(*bounds, w, h)
    with rasterio.open(url) as src:
        nodata = src.nodata if src.nodata is not None else 0
        with WarpedVRT(src, crs=crs, transform=transform, width=w, height=h,
                       resampling=resampling, src_nodata=nodata, nodata=nodata) as vrt:
            data = vrt.read(1).astype("float64")
        res = src.res[0]
    valid = np.isfinite(data) & (data != nodata) & (data > -1e30)
    return data, valid, res


def box_blur(mask: np.ndarray, radius: int) -> np.ndarray:
    """Среднее по квадрату (2r+1)² через накопленные суммы; у краёв — повтор краевых значений."""
    if radius < 1:
        return mask.astype("float64")
    k = 2 * radius + 1
    c = np.pad(mask.astype("float64"), radius, mode="edge").cumsum(0).cumsum(1)
    c = np.pad(c, ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def fuse_heights(z: np.ndarray, valid: np.ndarray, fill: np.ndarray, fill_valid: np.ndarray,
                 feather_px: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict]:
    """HiRISE поверх заполнения, шов сглаживается внутрь HiRISE на feather_px пикселей.

    Опорой по высоте служит заполнение: в Езеро CTX TRN совпадает с высотами локализации
    ровера, а стереопара CR смещена на несколько метров. HiRISE сдвигается на медиану
    разницы в общей зоне, форма рельефа не меняется.
    """
    overlap = valid & fill_valid
    diff = z[overlap] - fill[overlap]
    offset = float(np.median(diff)) if diff.size else 0.0
    z = z - offset
    # Доля HiRISE в окрестности: 1 в глубине, ~0,5 на краю → вес 1 … 0.
    weight = np.clip(box_blur(valid, feather_px) * 2 - 1, 0.0, 1.0) * valid
    out = np.where(valid & fill_valid, weight * z + (1 - weight) * fill,
                   np.where(valid, z, fill))
    source = np.full(z.shape, SRC_FILL, dtype=np.uint8)
    source[valid] = SRC_HIRISE
    source[valid & fill_valid & (weight < 0.999)] = SRC_BLEND
    stats = {
        "hirise_shift_m": round(-offset, 2),
        "hirise_minus_fill_m": {
            "p10": round(float(np.percentile(diff, 10)), 2),
            "median": round(offset, 2),
            "p90": round(float(np.percentile(diff, 90)), 2),
        } if diff.size else None,
    }
    return out, valid | fill_valid, source, stats


def match_brightness(img: np.ndarray, ref: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Линейно подгоняет яркость заполнения к HiRISE по 5-му и 95-му перцентилям общей зоны."""
    if mask.sum() < 1000:
        return img
    a_lo, a_hi = np.percentile(img[mask], [5, 95])
    b_lo, b_hi = np.percentile(ref[mask], [5, 95])
    if a_hi - a_lo < 1e-6:
        return img
    return (img - a_lo) * (b_hi - b_lo) / (a_hi - a_lo) + b_lo


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "martian-map-build"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


# Имена свойств путевых точек MMGIS: у MSL и M20 почти совпадают, но набор полей
# различается (M20: Note/final, elev_radii = -9999; MSL: drive_type). Берём первое найденное.
TRACK_FIELDS = {
    "lon": ("lon", "Lon", "longitude", "LON"),
    "lat": ("lat", "Lat", "latitude", "LAT"),
    "sol": ("sol", "Sol", "SOL"),
    "site": ("site", "Site", "SITE"),
    "drive": ("drive", "Drive", "DRIVE"),
    "elev_geoid": ("elev_geoid", "Elev_Geoid", "elevation", "elev"),
    "pitch": ("pitch", "Pitch"),
    "roll": ("roll", "Roll"),
    "kind": ("Note", "note", "drive_type"),
}


def track_prop(p: dict, key: str):
    for name in TRACK_FIELDS[key]:
        if p.get(name) is not None:
            return p[name]
    return None


def track_number(p: dict, key: str) -> float | None:
    """Число из свойства; заглушки MMGIS вроде -9999 считаются пропуском."""
    try:
        value = float(track_prop(p, key))
    except (TypeError, ValueError):
        return None
    return None if value <= -9000 or math.isnan(value) else value


def track_points(features: list[dict]):
    """(lon_east, lat, свойства) для каждой путевой точки MSL или M20."""
    for feature in features:
        p = feature.get("properties") or {}
        lon, lat = track_number(p, "lon"), track_number(p, "lat")
        if lon is None or lat is None:
            coords = (feature.get("geometry") or {}).get("coordinates") or []
            if len(coords) < 2:
                continue
            lon, lat = float(coords[0]), float(coords[1])
        yield lon % 360.0, lat, p


def saved_track_features(path: Path) -> list[dict] | None:
    """Путевые точки из ранее собранного track.geojson в виде свойств MMGIS (для build_track)."""
    if not path.exists():
        return None
    out = []
    for f in json.loads(path.read_text(encoding="utf-8"))["features"]:
        if f["geometry"]["type"] != "Point":
            continue
        p = f["properties"]
        props = {"sol": p.get("sol"), "site": p.get("site"), "drive": p.get("drive"),
                 "elev_geoid": p.get("rover_elev_geoid_m"), "pitch": p.get("pitch_deg"),
                 "roll": p.get("roll_deg")}
        if p.get("localization") is not None:
            props["Note"] = p["localization"]
        out.append({"geometry": f["geometry"], "properties": props})
    return out


def build_track(site: Site, z: np.ndarray, bounds: tuple, px: float,
                source: np.ndarray | None = None,
                features_in: list[dict] | None = None) -> tuple[dict, dict] | None:
    if not site.track_url:
        return None
    if features_in is None:
        features_in = fetch_json(site.track_url)["features"]
    west, south, east, north = bounds
    features, offsets = [], []
    for lon, lat, p in track_points(features_in):
        sol = track_number(p, "sol")
        if site.track_max_sol is not None and sol is not None and sol > site.track_max_sol:
            continue
        x, y = lonlat_to_eqc(lon, lat)
        if not (west <= x <= east and south <= y <= north):
            continue
        col, row = (x - west) / px - 0.5, (north - y) / px - 0.5
        dtm = bilinear(z, col, row)
        rover = track_number(p, "elev_geoid")
        offset = None
        if rover is not None and not math.isnan(dtm):
            offset = round(dtm - rover, 2)
            offsets.append(offset)
        props = {
            "sol": track_prop(p, "sol"),
            "site": track_prop(p, "site"),
            "drive": track_prop(p, "drive"),
            "rover_elev_geoid_m": rover,
            "dtm_height_m": None if math.isnan(dtm) else round(dtm, 2),
            "dtm_minus_rover_m": offset,
            "pitch_deg": track_number(p, "pitch"),
            "roll_deg": track_number(p, "roll"),
        }
        if track_prop(p, "kind") is not None:
            props["localization"] = track_prop(p, "kind")
        if source is not None:
            r = min(max(round(row), 0), source.shape[0] - 1)
            c = min(max(round(col), 0), source.shape[1] - 1)
            props["dtm_source"] = SRC_NAMES[int(source[r, c])]
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(lon, 7), round(lat, 7)]},
            "properties": props,
        })
    features.sort(key=lambda f: (f["properties"]["sol"] or 0, f["properties"]["drive"] or 0))
    line = {
        "type": "Feature",
        "geometry": {"type": "LineString",
                     "coordinates": [f["geometry"]["coordinates"] for f in features]},
        "properties": {"kind": "traverse", "mission": site.track_mission},
    }
    collection = {"type": "FeatureCollection", "features": [line, *features]}
    stats = {
        "source_url": site.track_url,
        "mission": site.track_mission,
        "points": len(features),
        "sols": [features[0]["properties"]["sol"], features[-1]["properties"]["sol"]]
        if features else None,
        "dtm_minus_rover_m": {
            "n": len(offsets),
            "median": round(float(np.median(offsets)), 2),
            "p10": round(float(np.percentile(offsets, 10)), 2),
            "p90": round(float(np.percentile(offsets, 90)), 2),
        } if offsets else None,
        "note": "Высота трека — телеметрия ровера (elev_geoid). Линию маршрута класть на "
        "рельеф DTM; разница — смещение вертикального датума, а не ошибка точки.",
    }
    if source is not None:
        by_source: dict[str, list] = {}
        for f in features:
            props = f["properties"]
            by_source.setdefault(props["dtm_source"], []).append(props["dtm_minus_rover_m"])
        stats["by_dtm_source"] = {
            name: {"points": len(values),
                   "median_dtm_minus_rover_m": round(float(np.median(known)), 2)
                   if (known := [v for v in values if v is not None]) else None}
            for name, values in by_source.items()
        }
    return collection, stats


@dataclass(frozen=True)
class HiOptions:
    """Детальное окно ортофото в родном разрешении HiRISE вокруг места старта."""
    pixel_m: float = 0.25
    size_px: int = 4096
    # None — выбрать автоматически (старт + метки); иначе (lat, lon_east) центра окна.
    center: tuple[float, float] | None = None
    quality: int = 88


def read_ortho(site: Site, bounds: tuple, shape: tuple[int, int], crs,
               resampling: Resampling) -> np.ndarray:
    """Ортофото HiRISE в сетке bounds × shape; 0 — нет данных."""
    if site.ortho_warp:
        img, lit_mask, _ = read_grid(site.ortho_url, bounds, shape, crs, resampling)
        return np.where(lit_mask, img, 0)
    with rasterio.open(site.ortho_url) as ortho:
        return ortho.read(1, window=from_bounds(*bounds, transform=ortho.transform),
                          out_shape=shape, resampling=resampling,
                          boundless=True, fill_value=0).astype("float64")


def start_point(site: Site, z: np.ndarray, valid: np.ndarray, source: np.ndarray | None,
                bounds: tuple, px: float) -> tuple[float, float]:
    """Место старта прогулки в м eqc — как walkScene.placeAtStart / nearestHirise.

    Первая метка участка; если под ней заполнение (не HiRISE), ближайшая по кольцам (шаг 10 м)
    точка HiRISE, отступив на 40 м вглубь. Поиск в метрах по земле (x сжат на cos широты).
    """
    west, south, east, north = bounds
    if site.pois:
        x0, y0 = lonlat_to_eqc(site.pois[0].lon_east, site.pois[0].lat)
    else:
        x0, y0 = (west + east) / 2, (south + north) / 2
    if source is None:
        return x0, y0
    kx = math.cos(((south + north) / 2) / MARS_R)

    def is_hi(x: float, y: float) -> bool:
        c, r = round((x - west) / px - 0.5), round((north - y) / px - 0.5)
        if not (0 <= c < z.shape[1] and 0 <= r < z.shape[0]):
            return False
        return bool(valid[r, c]) and int(source[r, c]) == SRC_HIRISE

    if is_hi(x0, y0):
        return x0, y0
    step = 10.0
    r = step
    while r < 4000:
        n = max(8, math.ceil(2 * math.pi * r / step))
        for k in range(n):
            a = k / n * 2 * math.pi
            # Локальные оси сцены: x на восток (м по земле), z на юг.
            if not is_hi(x0 + math.cos(a) * r / kx, y0 - math.sin(a) * r):
                continue
            for extra in (40, 20, 0):
                qx, qy = x0 + math.cos(a) * (r + extra) / kx, y0 - math.sin(a) * (r + extra)
                if is_hi(qx, qy):
                    return qx, qy
        r += step
    return x0, y0


def choose_hi_window(site: Site, bounds: tuple, height_px: float, window_m: float,
                     start: tuple[float, float], hirise: np.ndarray) -> tuple[tuple, str]:
    """Окно window_m × window_m (м eqc) с узлами на сетке высот; возвращает (bounds, пояснение).

    Если старт и все метки участка помещаются с полем 100 м — окно по их центру. Иначе окно
    содержит старт (с полем) и сдвигается так, чтобы в него попало больше снимка HiRISE.
    """
    west, south, east, north = bounds
    margin = 100.0
    targets = [lonlat_to_eqc(p.lon_east, p.lat) for p in site.pois]
    pts = [start, *targets]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    if max(xs) - min(xs) + 2 * margin <= window_m and max(ys) - min(ys) + 2 * margin <= window_m:
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        why = "окно покрывает место старта и все метки участка"
    else:
        # Интегральное изображение доли HiRISE: сумма по окну за O(1).
        integral = np.pad(hirise.astype("float64").cumsum(0).cumsum(1), ((1, 0), (1, 0)))
        n = round(window_m / height_px)
        best = None
        reach = window_m / 2 - margin
        for dx in np.arange(-reach, reach + 1, 32.0):
            for dy in np.arange(-reach, reach + 1, 32.0):
                c0 = round((start[0] + dx - window_m / 2 - west) / height_px)
                r0 = round((north - (start[1] + dy + window_m / 2)) / height_px)
                c0 = min(max(c0, 0), hirise.shape[1] - n)
                r0 = min(max(r0, 0), hirise.shape[0] - n)
                frac = (integral[r0 + n, c0 + n] - integral[r0, c0 + n]
                        - integral[r0 + n, c0] + integral[r0, c0]) / (n * n)
                score = (round(float(frac), 3), -math.hypot(dx, dy))
                if best is None or score > best[0]:
                    best = (score, start[0] + dx, start[1] + dy)
        _, cx, cy = best
        why = ("метки не помещаются в одно окно; окно содержит место старта и сдвинуто "
               "к большей площади HiRISE")
    half = window_m / 2
    cx = min(max(cx, west + half), east - half)
    cy = min(max(cy, south + half), north - half)
    # Углы окна на узлах сетки высот (и, значит, базового снимка 0,5 м).
    w0 = west + round((cx - half - west) / height_px) * height_px
    n0 = north - round((north - (cy + half)) / height_px) * height_px
    return (w0, n0 - window_m, w0 + window_m, n0), why


def build_ortho_hi(site: Site, out: Path, bounds: tuple, crs, hi: HiOptions,
                   lo: float, hi_val: float, base8: np.ndarray, base_bounds: tuple,
                   ortho_px: float, why: str, source_res: float) -> dict:
    """Детальное окно ортофото: та же растяжка яркости, что у ortho.webp; альфа — есть HiRISE."""
    n = hi.size_px
    img = read_ortho(site, bounds, (n, n), crs, Resampling.bilinear)
    lit = img > 0
    gray = np.clip((img - lo) / (hi_val - lo) * 254 + 1, 1, 255)
    # Где HiRISE нет — значения базового снимка (только чтобы фильтрация у края альфы не
    # тянула чёрное); сцена там всё равно показывает ortho.webp.
    span = round((bounds[2] - bounds[0]) / ortho_px)
    c0 = round((bounds[0] - base_bounds[0]) / ortho_px)
    r0 = round((base_bounds[3] - bounds[3]) / ortho_px)
    crop = base8[r0:r0 + span, c0:c0 + span]
    up = np.asarray(Image.fromarray(crop, "L").resize((n, n), Image.BILINEAR), dtype="float64")
    gray = np.where(lit, gray, up).astype(np.uint8)
    path = out / "ortho_hi.webp"
    if lit.all():
        Image.fromarray(gray, "L").save(path, quality=hi.quality, method=6)
    else:
        alpha = np.where(lit, 255, 0).astype(np.uint8)
        Image.fromarray(np.dstack([gray, gray, gray, alpha]), "RGBA").save(
            path, quality=hi.quality, method=6, alpha_quality=100)
    west, south, east, north = bounds
    c_lon, c_lat = eqc_to_lonlat((west + east) / 2, (south + north) / 2)
    return {
        "file": path.name,
        "width": n, "height": n, "pixel_m": hi.pixel_m,
        "bounds_eqc_m": [round(v, 2) for v in bounds],
        "center": {"lat": round(c_lat, 6), "lon_east": round(c_lon, 6)},
        "product": site.ortho_product, "url": site.ortho_url,
        "source_pixel_m": round(source_res, 4),
        "hirise_fraction": round(float(lit.mean()), 4),
        "alpha": "есть только при пропусках: 255 — снимок HiRISE, 0 — нет данных (брать ortho)",
        "stretch": "та же линейная растяжка яркости, что у ortho.webp",
        "resampling": "bilinear из исходного пикселя; без повышения резкости",
        "choice": why,
        "blend_m": 25,
    }


def build(site: Site, out_root: Path, height_px: float, ortho_px: float,
          hi: HiOptions | None = HiOptions(), refresh_track: bool = False) -> dict:
    cx, cy = lonlat_to_eqc(site.center_lon_east, site.center_lat)
    w_m, h_m = site.size_m
    bounds = (cx - w_m / 2, cy - h_m / 2, cx + w_m / 2, cy + h_m / 2)
    hw, hh = round(w_m / height_px), round(h_m / height_px)

    with rasterio.open(site.dtm_url) as ds:
        window = from_bounds(*bounds, transform=ds.transform)
        # Шаг около родного (1 м при пикселе DTM 1,01 м): среднее по площади вырождается в
        # ближайший пиксель со ступеньками, поэтому билинейная интерполяция без сглаживания.
        dtm_resampling = (Resampling.average if height_px >= 1.5 * ds.res[0]
                          else Resampling.bilinear)
        z = ds.read(1, window=window, out_shape=(hh, hw), resampling=dtm_resampling,
                    boundless=True, fill_value=ds.nodata if ds.nodata is not None else -3.4e38)
        z = z.astype("float64")
        valid = np.isfinite(z) & (z > -1e30)
        if ds.nodata is not None:
            valid &= z != ds.nodata
        crs = ds.crs
        source_res = ds.res[0]

    source = None
    fill_stats = None
    hirise_fraction = float(valid.mean())
    if site.dtm_fill:
        # Билинейная интерполяция CTX — сглаженная поверхность без выдуманных деталей.
        fill, fill_valid, _ = read_grid(site.dtm_fill.url, bounds, (hh, hw), crs,
                                        Resampling.bilinear)
        feather = max(1, round(site.feather_m / height_px))
        z, valid, source, fill_stats = fuse_heights(z, valid, fill, fill_valid, feather)
    if valid.mean() < 0.5:
        raise SystemExit(f"{site.id}: в участке меньше половины валидных высот")

    ow, oh = round(w_m / ortho_px), round(h_m / ortho_px)
    img = read_ortho(site, bounds, (oh, ow), crs, Resampling.average)
    with rasterio.open(site.ortho_url) as ortho:
        ortho_res = ortho.res[0]
    ortho_hirise_fraction = float((img > 0).mean())
    if site.ortho_fill:
        fill_img, fill_mask, _ = read_grid(site.ortho_fill.url, bounds, (oh, ow), crs,
                                           Resampling.bilinear)
        fill_img = match_brightness(fill_img, img, fill_mask & (img > 0))
        # Ноль зарезервирован под «нет данных».
        img = np.where(img > 0, img, np.where(fill_mask, np.maximum(fill_img, 1e-3), 0))
    lit = img[img > 0]
    lo, hi_val = np.percentile(lit, [0.5, 99.5])
    img8 = np.where(img > 0, np.clip((img - lo) / (hi_val - lo) * 254 + 1, 1, 255),
                    0).astype(np.uint8)

    out = out_root / site.id
    out.mkdir(parents=True, exist_ok=True)
    rgb, base, step = encode_heights(z, valid, source)
    check = decode_heights(rgb, base, step)
    assert np.nanmax(np.abs(check[valid] - z[valid])) <= step / 2 + 1e-6
    Image.fromarray(rgb, "RGB").save(out / "height.png", optimize=True)
    Image.fromarray(img8, "L").save(out / "ortho.webp", quality=82, method=6)

    files = {"height": "height.png", "ortho": "ortho.webp"}
    ortho_hi_meta = None
    if hi:
        hirise = valid if source is None else valid & (source == SRC_HIRISE)
        if hi.center:
            start = lonlat_to_eqc(hi.center[1], hi.center[0])
            hi_bounds, why = choose_hi_window(
                replace(site, pois=()), bounds, height_px, hi.pixel_m * hi.size_px, start, hirise)
            why = "центр окна задан вручную (--hi-center)"
        else:
            start = start_point(site, z, valid, source, bounds, height_px)
            hi_bounds, why = choose_hi_window(site, bounds, height_px, hi.pixel_m * hi.size_px,
                                              start, hirise)
        ortho_hi_meta = build_ortho_hi(site, out, hi_bounds, crs, hi, lo, hi_val, img8, bounds,
                                       ortho_px, why, ortho_res)
        start_lon, start_lat = eqc_to_lonlat(*start)
        ortho_hi_meta["start"] = {"lat": round(start_lat, 6), "lon_east": round(start_lon, 6)}
        files["ortho_hi"] = ortho_hi_meta["file"]
    elif (out / "ortho_hi.webp").exists():
        (out / "ortho_hi.webp").unlink()
    track_in = None if refresh_track else saved_track_features(out / "track.geojson")
    track = build_track(site, np.where(valid, z, np.nan), bounds, height_px, source, track_in)
    track_stats = None
    if track:
        collection, track_stats = track
        (out / "track.geojson").write_text(json.dumps(collection, ensure_ascii=False))
        files["track"] = "track.geojson"

    west_lon, south_lat = eqc_to_lonlat(bounds[0], bounds[1])
    east_lon, north_lat = eqc_to_lonlat(bounds[2], bounds[3])
    sources = [
        {"role": "dtm", "product": site.dtm_product, "url": site.dtm_url,
         "source_pixel_m": round(source_res, 3), "credit": site.dtm_credit,
         "license": site.license},
        {"role": "ortho", "product": site.ortho_product, "url": site.ortho_url,
         "source_pixel_m": round(ortho_res, 3), "credit": site.ortho_credit,
         "license": site.license},
    ]
    height_meta = {
        "file": files["height"],
        "width": hw, "height": hh, "pixel_m": height_px,
        "encoding": "units=(R<<8)|G; height_m=base_m+(units-1)*step_m; units=0 is NoData",
        "base_m": base, "step_m": step,
        "min_m": round(float(z[valid].min()), 2), "max_m": round(float(z[valid].max()), 2),
        "nodata_fraction": round(float(1 - valid.mean()), 4),
        "vertical_reference": "areoid (как в продукте HiRISE DTM USGS)",
        "rows": "first row is north edge, columns go east",
    }
    ortho_meta = {"file": files["ortho"], "width": ow, "height": oh, "pixel_m": ortho_px,
                  "value_0": "нет данных"}
    if site.dtm_fill:
        sources.append({"role": "dtm_fill", "product": site.dtm_fill.product,
                        "url": site.dtm_fill.url, "source_pixel_m": site.dtm_fill.pixel_m,
                        "credit": site.dtm_fill.credit, "license": site.license})
        height_meta["source_channel"] = {
            "channel": "B",
            "values": {str(SRC_HIRISE): "HiRISE DTM 1 м", str(SRC_FILL): "CTX DTM 20 м "
                       "(билинейная интерполяция)", str(SRC_BLEND): "переходная полоса"},
            "hirise_fraction": round(hirise_fraction, 4),
            "fill_fraction": round(float((source == SRC_FILL).mean()), 4),
            **fill_stats,
        }
    if site.ortho_fill:
        sources.append({"role": "ortho_fill", "product": site.ortho_fill.product,
                        "url": site.ortho_fill.url, "source_pixel_m": site.ortho_fill.pixel_m,
                        "credit": site.ortho_fill.credit, "license": site.license})
        ortho_meta["hirise_fraction"] = round(ortho_hirise_fraction, 4)
        ortho_meta["fill_note"] = (f"где нет HiRISE — {site.ortho_fill.product}, "
                                   "яркость подогнана к HiRISE")
    manifest = {
        "schema_version": 1,
        "id": site.id,
        "title": site.title,
        "note": site.note,
        "crs": crs.to_proj4(),
        "coordinates": "planetocentric latitude, east longitude 0-360",
        "center": {"lat": site.center_lat, "lon_east": site.center_lon_east},
        "bounds_eqc_m": [round(v, 2) for v in bounds],
        "bounds_lonlat": {"west": round(west_lon, 6), "south": round(south_lat, 6),
                          "east": round(east_lon, 6), "north": round(north_lat, 6)},
        "size_m": [w_m, h_m],
        "height": height_meta,
        "ortho": ortho_meta,
        **({"ortho_hi": ortho_hi_meta} if ortho_hi_meta else {}),
        "sources": sources,
        "pois": [poi.__dict__ for poi in site.pois],
        "track": track_stats,
        "generated_by": "backend/scripts/build_local_package.py",
        "sha256": {name: sha256(out / f) for name, f in files.items()},
    }
    if ortho_hi_meta:
        ortho_hi_meta["sha256"] = manifest["sha256"]["ortho_hi"]
    if site.quality_note:
        manifest["quality_note"] = site.quality_note
    # Дальний план (backdrop.glb) собирает Blender-скрипт site_scene.py --backdrop; пересборка
    # пакета его не трогает, поэтому переносим запись из прежнего манифеста.
    previous = out / "manifest.json"
    if previous.exists() and (out / "backdrop.glb").exists():
        old = json.loads(previous.read_text(encoding="utf-8"))
        if "backdrop" in old:
            manifest["backdrop"] = old["backdrop"]
            manifest["sha256"]["backdrop"] = sha256(out / "backdrop.glb")
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    sizes = {f: round((out / f).stat().st_size / 1e6, 2) for f in files.values()}
    print(json.dumps({"id": site.id, "mb": sizes, "height": manifest["height"],
                      "ortho_hi": ortho_hi_meta, "track": track_stats}, ensure_ascii=False))
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--site", choices=[*SITES, "all"], default="all")
    parser.add_argument("--out", type=Path, default=OUT_ROOT)
    parser.add_argument("--height-px", type=float, default=1.0,
                        help="шаг сетки высот, м (1 — родной шаг HiRISE DTM)")
    parser.add_argument("--ortho-px", type=float, default=0.5,
                        help="размер пикселя базового ортофото на весь участок, м")
    parser.add_argument("--hi-px", type=float, default=0.25,
                        help="размер пикселя детального окна ortho_hi.webp, м")
    parser.add_argument("--hi-size", type=int, default=4096,
                        help="сторона детального окна в пикселях")
    parser.add_argument("--hi-center", type=str, default=None,
                        help="центр детального окна «lat,lon_east»; по умолчанию — по месту старта")
    parser.add_argument("--no-hi", action="store_true", help="не собирать ortho_hi.webp")
    parser.add_argument("--refresh-track", action="store_true",
                        help="скачать путевые точки ровера заново, а не брать из track.geojson")
    args = parser.parse_args()
    center = tuple(float(v) for v in args.hi_center.split(",")) if args.hi_center else None
    hi = None if args.no_hi else HiOptions(pixel_m=args.hi_px, size_px=args.hi_size,
                                             center=center)
    for key in SITES if args.site == "all" else [args.site]:
        build(SITES[key], args.out, args.height_px, args.ortho_px, hi, args.refresh_track)


if __name__ == "__main__":
    main()
