# Суточная погода кратера Гейла (MSL REMS, научно-популярная лента mars.nasa.gov).
import math
import os

from martian_map.i18n import Text
from martian_map.modules.eva_sources import cache

DEFAULT_URL = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"
MAX_HISTORY = 60
CAVEAT = Text(
    "источник научно-популярный (прямая оговорка издателя); "
    "для научной точности — архив прибора в PDS (давление ~3.5 Па точности)",
    "a public-outreach source (the publisher says so explicitly); "
    "for scientific accuracy use the instrument archive in PDS (pressure accurate to ~3.5 Pa)",
)


def feed_url() -> str:
    return os.environ.get("MARTIAN_MSL_WEATHER_URL", DEFAULT_URL)


def _number(value: object) -> float | None:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def normalize(raw: dict) -> dict:
    return {
        "sol": raw.get("sol"),
        "terrestrial_date": raw.get("terrestrial_date"),
        "season": raw.get("season"),
        "ls_deg": _number(raw.get("ls")),
        "min_temp_c": _number(raw.get("min_temp")),
        "max_temp_c": _number(raw.get("max_temp")),
        "pressure_pa": _number(raw.get("pressure")),
        "atmo_opacity": raw.get("atmo_opacity"),
        "sunrise": raw.get("sunrise"),
        "sunset": raw.get("sunset"),
    }


def _sol_key(item: dict) -> int:
    try:
        return int(item.get("sol"))
    except (TypeError, ValueError):
        return -1


async def fetch_conditions(history: int = 7) -> dict:
    history = max(0, min(int(history), MAX_HISTORY))
    url = feed_url()
    key = f"gale:{url}:{history}"
    cached = cache.cache_get(key)
    if cached is not None:
        return cached
    try:
        payload = await cache.fetch_json(url)
        records = payload.get("soles") if isinstance(payload, dict) else None
        if not isinstance(records, list) or not records:
            raise ValueError("в ленте нет списка soles")
        ordered = sorted((r for r in records if isinstance(r, dict)), key=_sol_key, reverse=True)
        rows = [normalize(r) for r in ordered[: history + 1]]
        if not rows:
            raise ValueError("лента пуста")
    except Exception as exc:
        return cache.unavailable(
            Text(
                f"лента погоды недоступна или вернула неожиданный ответ: {type(exc).__name__}",
                f"weather feed unavailable or returned an unexpected response: "
                f"{type(exc).__name__}",
            )
        )
    result = {
        "status": "ok",
        "source": Text(
            "NASA/JPL mars.nasa.gov, лента MSL REMS", "NASA/JPL mars.nasa.gov, MSL REMS feed"
        ),
        "url": url,
        "units": {"temperature": "°C", "pressure": "Pa", "ls": "deg"},
        "latest": rows[0],
        "previous": rows[1:],
        "caveat": CAVEAT,
    }
    cache.cache_put(key, result)
    return result
