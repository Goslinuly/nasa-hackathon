"""Текущие позиции роверов в рантайме: файлы локализаций NASA MMGIS, кэш один час."""

from datetime import UTC, datetime

from martian_map.i18n import Text
from martian_map.modules.eva_sources import cache

MMGIS = "https://mars.nasa.gov/mmgis-maps"
SOURCES = {
    "perseverance": f"{MMGIS}/M20/Layers/json/M20_waypoints_current.json",
    "curiosity": f"{MMGIS}/MSL/Layers/json/MSL_waypoints_current.json",
}
CREDIT = "NASA/JPL-Caltech, MMGIS"
TTL_S = 3600

NOTE = Text(
    "Последняя точка файла локализаций миссии;"
    " обновляется NASA с задержкой до нескольких солов",
    "The last point of the mission localization file;"
    " NASA updates it with a delay of up to a few sols",
)
UNAVAILABLE = Text(
    "файлы локализаций MMGIS недоступны",
    "the MMGIS localization files are unavailable",
)


def parse_current(payload: object) -> dict | None:
    if not isinstance(payload, dict):
        return None
    features = payload.get("features")
    if not isinstance(features, list) or not features:
        return None
    feature = features[0]
    geometry = feature.get("geometry") or {}
    coords = geometry.get("coordinates")
    props = feature.get("properties") or {}
    if not isinstance(coords, list) or len(coords) < 2:
        return None
    lon = float(coords[0]) % 360
    lat = float(coords[1])
    sol = props.get("sol")
    return {
        "lon": lon,
        "lat": lat,
        "sol": int(sol) if isinstance(sol, int | float) else None,
        "elevation_m": float(coords[2]) if len(coords) > 2 else None,
        "dist_total_m": props.get("dist_total_m") or props.get("dist_total"),
    }


async def fetch_positions() -> dict:
    key = "rover-positions"
    cached = cache.cache_get(key, ttl_s=TTL_S)
    if cached is not None:
        return cached
    rovers = {}
    for rover, url in SOURCES.items():
        try:
            parsed = parse_current(await cache.fetch_json(url))
        except Exception:  # noqa: BLE001
            parsed = None
        if parsed is not None:
            rovers[rover] = {**parsed, "source_url": url}
    if not rovers:
        return cache.unavailable(UNAVAILABLE)
    result = {
        "status": "ok",
        "fetched_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rovers": rovers,
        "credit": CREDIT,
        "note": NOTE,
    }
    cache.cache_put(key, result)
    return result
