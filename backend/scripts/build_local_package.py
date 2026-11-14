"""Сборка локальных пакетов рельефа для вида от первого лица (docs/TZ_First_Person.md).

Пакет одного участка — папка `frontend/public/data/local/<site>/`:

- `height.png` — высоты HiRISE DTM в 16-битном коде RGB без потерь:
  units = (R << 8) | G; height_m = base_m + (units - 1) * step_m; units = 0 — NoData.
  Канал B = 0. Браузер декодирует PNG без потерь, как у карты высот глобуса.
- `ortho.webp` — ортофото HiRISE RED в тех же границах.
- `track.geojson` — путевые точки ровера внутри участка (если есть) с высотой
  DTM под каждой точкой и разницей с высотой из телеметрии ровера.
- `manifest.json` — продукты, CRS, границы, кодирование, кредиты, точки интереса,
  статистика смещения высот трека и SHA-256 файлов.

Исходники читаются по сети окнами (Cloud Optimized GeoTIFF), целиком не скачиваются.

Запуск из backend (`pip install -e ".[terrain]"`):
    python scripts/build_local_package.py --site all
    python scripts/build_local_package.py --site gale-boxwork --height-px 1
"""

import argparse
import hashlib
import json
import math
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

MARS_R = 3396190.0  # радиус сферы в CRS продуктов HiRISE DTM USGS
HIRISE = "https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/"
MSL_WAYPOINTS = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"
HIRISE_CREDIT = "NASA/JPL/University of Arizona (HiRISE); DTM USGS Astrogeology"
OUT_ROOT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "local"


@dataclass(frozen=True)
class Poi:
    id: str
    title: str
    lat: float
    lon_east: float
    note: str


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
}


def lonlat_to_eqc(lon_east: float, lat: float) -> tuple[float, float]:
    """Равнопромежуточная проекция продуктов HiRISE DTM USGS (lon_0=0, lat_ts=0)."""
    lon = ((lon_east + 180.0) % 360.0) - 180.0
    return MARS_R * math.radians(lon), MARS_R * math.radians(lat)


def eqc_to_lonlat(x: float, y: float) -> tuple[float, float]:
    return math.degrees(x / MARS_R) % 360.0, math.degrees(y / MARS_R)


def encode_heights(z: np.ndarray, valid: np.ndarray) -> tuple[np.ndarray, float, float]:
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


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "martian-map-build"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def build_track(site: Site, z: np.ndarray, bounds: tuple, px: float) -> tuple[dict, dict] | None:
    if not site.track_url:
        return None
    west, south, east, north = bounds
    features, offsets = [], []
    for feature in fetch_json(site.track_url)["features"]:
        p = feature["properties"]
        lon, lat = float(p["lon"]), float(p["lat"])
        x, y = lonlat_to_eqc(lon, lat)
        if not (west <= x <= east and south <= y <= north):
            continue
        dtm = bilinear(z, (x - west) / px - 0.5, (north - y) / px - 0.5)
        rover = p.get("elev_geoid")
        offset = None
        if rover is not None and rover > -9000 and not math.isnan(dtm):
            offset = round(dtm - float(rover), 2)
            offsets.append(offset)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(lon, 7), round(lat, 7)]},
            "properties": {
                "sol": p.get("sol"),
                "site": p.get("site"),
                "drive": p.get("drive"),
                "rover_elev_geoid_m": rover,
                "dtm_height_m": None if math.isnan(dtm) else round(dtm, 2),
                "dtm_minus_rover_m": offset,
                "pitch_deg": p.get("pitch"),
                "roll_deg": p.get("roll"),
            },
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
    return collection, stats


def build(site: Site, out_root: Path, height_px: float, ortho_px: float) -> dict:
    cx, cy = lonlat_to_eqc(site.center_lon_east, site.center_lat)
    w_m, h_m = site.size_m
    bounds = (cx - w_m / 2, cy - h_m / 2, cx + w_m / 2, cy + h_m / 2)
    hw, hh = round(w_m / height_px), round(h_m / height_px)

    with rasterio.open(site.dtm_url) as ds:
        window = from_bounds(*bounds, transform=ds.transform)
        z = ds.read(1, window=window, out_shape=(hh, hw), resampling=Resampling.average,
                    boundless=True, fill_value=ds.nodata if ds.nodata is not None else -3.4e38)
        z = z.astype("float64")
        valid = np.isfinite(z) & (z > -1e30)
        if ds.nodata is not None:
            valid &= z != ds.nodata
        crs = ds.crs.to_proj4()
        source_res = ds.res[0]
    if valid.mean() < 0.5:
        raise SystemExit(f"{site.id}: в участке меньше половины валидных высот")

    ow, oh = round(w_m / ortho_px), round(h_m / ortho_px)
    with rasterio.open(site.ortho_url) as ortho:
        img = ortho.read(1, window=from_bounds(*bounds, transform=ortho.transform),
                         out_shape=(oh, ow), resampling=Resampling.average,
                         boundless=True, fill_value=0).astype("float64")
    lit = img[img > 0]
    lo, hi = np.percentile(lit, [0.5, 99.5])
    img8 = np.where(img > 0, np.clip((img - lo) / (hi - lo) * 254 + 1, 1, 255), 0).astype(np.uint8)

    out = out_root / site.id
    out.mkdir(parents=True, exist_ok=True)
    rgb, base, step = encode_heights(z, valid)
    check = decode_heights(rgb, base, step)
    assert np.nanmax(np.abs(check[valid] - z[valid])) <= step / 2 + 1e-6
    Image.fromarray(rgb, "RGB").save(out / "height.png", optimize=True)
    Image.fromarray(img8, "L").save(out / "ortho.webp", quality=82, method=6)

    files = {"height": "height.png", "ortho": "ortho.webp"}
    track = build_track(site, np.where(valid, z, np.nan), bounds, height_px)
    track_stats = None
    if track:
        collection, track_stats = track
        (out / "track.geojson").write_text(json.dumps(collection, ensure_ascii=False))
        files["track"] = "track.geojson"

    west_lon, south_lat = eqc_to_lonlat(bounds[0], bounds[1])
    east_lon, north_lat = eqc_to_lonlat(bounds[2], bounds[3])
    manifest = {
        "schema_version": 1,
        "id": site.id,
        "title": site.title,
        "note": site.note,
        "crs": crs,
        "coordinates": "planetocentric latitude, east longitude 0-360",
        "center": {"lat": site.center_lat, "lon_east": site.center_lon_east},
        "bounds_eqc_m": [round(v, 2) for v in bounds],
        "bounds_lonlat": {"west": round(west_lon, 6), "south": round(south_lat, 6),
                          "east": round(east_lon, 6), "north": round(north_lat, 6)},
        "size_m": [w_m, h_m],
        "height": {
            "file": files["height"],
            "width": hw, "height": hh, "pixel_m": height_px,
            "encoding": "units=(R<<8)|G; height_m=base_m+(units-1)*step_m; units=0 is NoData",
            "base_m": base, "step_m": step,
            "min_m": round(float(z[valid].min()), 2), "max_m": round(float(z[valid].max()), 2),
            "nodata_fraction": round(float(1 - valid.mean()), 4),
            "vertical_reference": "areoid (как в продукте HiRISE DTM USGS)",
            "rows": "first row is north edge, columns go east",
        },
        "ortho": {"file": files["ortho"], "width": ow, "height": oh, "pixel_m": ortho_px,
                  "value_0": "нет данных"},
        "sources": [
            {"role": "dtm", "product": site.dtm_product, "url": site.dtm_url,
             "source_pixel_m": round(source_res, 3), "credit": HIRISE_CREDIT,
             "license": "CC0-1.0 по STAC item"},
            {"role": "ortho", "product": site.ortho_product, "url": site.ortho_url,
             "credit": HIRISE_CREDIT, "license": "CC0-1.0 по STAC item"},
        ],
        "pois": [poi.__dict__ for poi in site.pois],
        "track": track_stats,
        "generated_by": "backend/scripts/build_local_package.py",
        "sha256": {name: sha256(out / f) for name, f in files.items()},
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    sizes = {f: round((out / f).stat().st_size / 1e6, 2) for f in files.values()}
    print(json.dumps({"id": site.id, "mb": sizes, "height": manifest["height"],
                      "track": track_stats}, ensure_ascii=False))
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--site", choices=[*SITES, "all"], default="all")
    parser.add_argument("--out", type=Path, default=OUT_ROOT)
    parser.add_argument("--height-px", type=float, default=2.0, help="шаг сетки высот, м")
    parser.add_argument("--ortho-px", type=float, default=0.5, help="размер пикселя ортофото, м")
    args = parser.parse_args()
    for key in SITES if args.site == "all" else [args.site]:
        build(SITES[key], args.out, args.height_px, args.ortho_px)


if __name__ == "__main__":
    main()
