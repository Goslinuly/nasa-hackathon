"""Сборка растровой подложки геокарты Марса (USGS SIM 3292, Tanaka et al. 2014) и легенды."""

import json
import sys
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

from PIL import Image, ImageDraw

SERVICE = (
    "https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/"
    "Tanaka_et_al_2014_Mars_Global_Map_Features/FeatureServer/3"
)
WIDTH, HEIGHT = 5760, 2880
PAGE = 500
OFFSET_DEG = 0.02
OUT_DIR = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "geology"


def fetch_json(url: str, params: dict) -> dict:
    query = urllib.parse.urlencode(params)
    with urllib.request.urlopen(f"{url}?{query}", timeout=120) as response:
        return json.load(response)


def load_renderer() -> dict[str, dict]:
    info = fetch_json(SERVICE, {"f": "json"})
    units: dict[str, dict] = {}
    for item in info["drawingInfo"]["renderer"]["uniqueValueInfos"]:
        rgba = item["symbol"].get("color") or [128, 128, 128, 255]
        units[str(item["value"])] = {
            "unit": str(item["value"]),
            "label": item.get("label") or str(item["value"]),
            "color": rgba[:3],
        }
    return units


def load_features() -> list[dict]:
    features: list[dict] = []
    offset = 0
    while True:
        payload = fetch_json(
            f"{SERVICE}/query",
            {
                "where": "1=1",
                "outFields": "Unit",
                "f": "geojson",
                "outSR": 4326,
                "maxAllowableOffset": OFFSET_DEG,
                "resultOffset": offset,
                "resultRecordCount": PAGE,
            },
        )
        page = payload.get("features", [])
        features.extend(page)
        if len(page) < PAGE:
            return features
        offset += PAGE
        print(f"загружено {len(features)} полигонов...", file=sys.stderr)


def to_pixels(ring: list[list[float]]) -> list[tuple[float, float]]:
    return [((lon + 180.0) / 360.0 * WIDTH, (90.0 - lat) / 180.0 * HEIGHT) for lon, lat in ring]


def draw_feature(image: Image.Image, geometry: dict, color: tuple[int, int, int]) -> None:
    polygons = geometry["coordinates"]
    if geometry["type"] == "Polygon":
        polygons = [polygons]
    for rings in polygons:
        if not rings:
            continue
        mask = Image.new("1", (WIDTH, HEIGHT), 0)
        drawer = ImageDraw.Draw(mask)
        drawer.polygon(to_pixels(rings[0]), fill=1)
        for hole in rings[1:]:
            drawer.polygon(to_pixels(hole), fill=0)
        image.paste(Image.new("RGB", (WIDTH, HEIGHT), color), (0, 0), mask)


def main() -> int:
    units = load_renderer()
    features = load_features()
    print(f"полигонов: {len(features)}, юнитов: {len(units)}", file=sys.stderr)
    image = Image.new("RGB", (WIDTH, HEIGHT), (16, 16, 20))
    missing: set[str] = set()
    def area(feature: dict) -> float:
        return feature["properties"].get("Shape__Area") or 0

    for feature in sorted(features, key=area, reverse=True):
        unit = str(feature["properties"].get("Unit"))
        entry = units.get(unit)
        if entry is None:
            missing.add(unit)
            continue
        draw_feature(image, feature["geometry"], tuple(entry["color"]))
    if missing:
        print(f"юниты без цвета в рендерере: {sorted(missing)}", file=sys.stderr)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    image.save(OUT_DIR / "mars_geology_sim3292.png", optimize=True)
    legend = {
        "title": "Геологическая карта Марса 1:20 000 000",
        "credit": "USGS SIM 3292, Tanaka et al. (2014); сервис USGS Astrogeology ArcGIS",
        "source": SERVICE,
        "retrieved": datetime.now(UTC).date().isoformat(),
        "status": "производный растр из векторной публикации, упрощение 0.02°",
        "extent": {"lon_min": -180, "lon_max": 180, "lat_min": -90, "lat_max": 90},
        "units": sorted(units.values(), key=lambda u: u["unit"]),
    }
    (OUT_DIR / "legend.json").write_text(
        json.dumps(legend, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"готово: {OUT_DIR}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
