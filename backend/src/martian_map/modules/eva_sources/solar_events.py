# Солнечные события DONKI (CCMC, без ключа); на карту Марса их наносить как есть нельзя.
import os
from datetime import UTC, datetime, timedelta

from martian_map.i18n import Text
from martian_map.modules.eva_sources import cache

DEFAULT_URL = "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get"
EVENT_KINDS = ("FLR", "CMEAnalysis", "SEP")
TIME_KEYS = {"FLR": "peakTime", "CMEAnalysis": "time21_5", "SEP": "eventTime"}
MAX_DAYS = 90
CAVEAT = Text(
    "каталог описывает обстановку преимущественно по наблюдениям у Земли; "
    "для Марса нужны время распространения и магнитная связность",
    "the catalog describes conditions mostly from observations near Earth; "
    "for Mars, propagation time and magnetic connectivity are needed",
)


def base_url() -> str:
    return os.environ.get("MARTIAN_DONKI_URL", DEFAULT_URL).rstrip("/")


def compact_event(kind: str, raw: dict) -> dict:
    event = {
        "type": kind,
        "time": raw.get(TIME_KEYS[kind]) or raw.get("startTime"),
        "link": raw.get("link"),
    }
    if kind == "FLR":
        event["class"] = raw.get("classType")
    if kind == "CMEAnalysis":
        event["speed_km_s"] = raw.get("speed")
    return event


async def fetch_events(days: int = 14) -> dict:
    days = max(1, min(int(days), MAX_DAYS))
    end = datetime.now(UTC).date()
    params = {"startDate": (end - timedelta(days=days)).isoformat(), "endDate": end.isoformat()}
    key = f"donki:{base_url()}:{days}:{end.isoformat()}"
    cached = cache.cache_get(key)
    if cached is not None:
        return cached
    events: list[dict] = []
    try:
        for kind in EVENT_KINDS:
            payload = await cache.fetch_json(f"{base_url()}/{kind}", params)
            if payload in (None, ""):
                continue
            if not isinstance(payload, list):
                raise ValueError("ответ DONKI не является списком")
            events.extend(compact_event(kind, item) for item in payload if isinstance(item, dict))
    except Exception as exc:
        return cache.unavailable(
            Text(
                f"DONKI недоступен или вернул неожиданный ответ: {type(exc).__name__}",
                f"DONKI unavailable or returned an unexpected response: {type(exc).__name__}",
            )
        )
    events.sort(key=lambda e: e["time"] or "", reverse=True)
    result = {
        "status": "ok",
        "source": "NASA CCMC DONKI",
        "days": days,
        "count": len(events),
        "events": events,
        "caveat": CAVEAT,
        "applicable_to_mars_map": False,
    }
    cache.cache_put(key, result)
    return result
