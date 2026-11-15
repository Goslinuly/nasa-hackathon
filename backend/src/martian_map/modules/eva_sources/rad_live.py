# Дозиметрия RAD (MSL) через ISWA HAPI: ошибки сети и формата не превращаются в 500.
import math
import os
from datetime import UTC, datetime, timedelta

from martian_map.i18n import Text
from martian_map.modules.eva_sources import cache

DEFAULT_URL = "https://iswa.gsfc.nasa.gov/IswaSystemWebApp/hapi"
DATASET_ID = "msl_rad_dosimetry"
MAX_DAYS = 120


def base_url() -> str:
    return os.environ.get("MARTIAN_ISWA_HAPI_URL", DEFAULT_URL).rstrip("/")


def parse_hapi(payload: object) -> list[dict]:
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise ValueError("ответ HAPI не содержит массива data")
    rows = []
    for row in payload["data"]:
        if not isinstance(row, list) or len(row) < 2 or not isinstance(row[0], str):
            raise ValueError("строка HAPI имеет неожиданный формат")
        value = row[1]
        if isinstance(value, bool) or not isinstance(value, int | float):
            continue
        if not math.isfinite(value) or value < 0:
            continue
        rows.append({"time": row[0], "dose_ugy_per_sol": float(value)})
    daily: dict[str, list[float]] = {}
    for row in rows:
        daily.setdefault(row["time"][:10], []).append(row["dose_ugy_per_sol"])
    return [
        {"time": day, "dose_ugy_per_sol": sum(values) / len(values), "samples": len(values)}
        for day, values in sorted(daily.items())
    ]


async def fetch_rad(days: int = 30) -> dict:
    days = max(1, min(int(days), MAX_DAYS))
    now = datetime.now(UTC).replace(microsecond=0, tzinfo=None)
    params = {
        "id": DATASET_ID,
        "parameters": "Time,dose_e_total",
        "time.min": (now - timedelta(days=days)).isoformat() + "Z",
        "time.max": now.isoformat() + "Z",
        "format": "json",
    }
    url = f"{base_url()}/data"
    key = f"rad:{url}:{days}"
    cached = cache.cache_get(key)
    if cached is not None:
        return cached
    try:
        series = parse_hapi(await cache.fetch_json(url, params))
    except Exception as exc:
        return cache.unavailable(
            Text(
                f"ISWA HAPI недоступен или вернул неожиданный ответ: {type(exc).__name__}",
                f"ISWA HAPI unavailable or returned an unexpected response: {type(exc).__name__}",
            )
        )
    result = {
        "status": "ok",
        "source": Text(
            "NASA ISWA HAPI, msl_rad_dosimetry, детектор E (тканеэквивалентный пластик)",
            "NASA ISWA HAPI, msl_rad_dosimetry, detector E (tissue-equivalent plastic)",
        ),
        "dataset": DATASET_ID,
        "url": url,
        "days": days,
        "unit": "uGy/sol",
        "count": len(series),
        "series": series,
        "caveat": Text(
            "Ряд из внешнего сервиса как есть, без калибровки и без привязки к точке карты.",
            "Series from an external service as is, without calibration "
            "and not tied to a map point.",
        ),
    }
    cache.cache_put(key, result)
    return result
