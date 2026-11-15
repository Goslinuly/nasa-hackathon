"""Прокси каталога солнечных событий NASA DONKI (CCMC).

Берём четыре типа: вспышки (FLR), выбросы корональной массы (CME), потоки
солнечных энергичных частиц (SEP) и геомагнитные бури (GST). Ключ не нужен.
Ответ кэшируется в памяти процесса на 30 минут; при отказе DONKI отдаём
последний удачный ответ, если он не старше 6 часов, иначе — ошибку.
"""

import asyncio
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from martian_map.i18n import Text

DONKI_URL = "https://ccmc.gsfc.nasa.gov/DONKI/WS/get"
EVENT_TYPES = ("FLR", "CME", "SEP", "GST")
NOTE = Text(
    "DONKI описывает обстановку у Земли; приход к Марсу — оценка",
    "DONKI describes conditions near Earth; arrival at Mars is an estimate",
)
CACHE_TTL_S = 30 * 60
STALE_TTL_S = 6 * 60 * 60
TIMEOUT_S = 15.0


class DonkiUnavailable(Exception):
    """DONKI не ответил или ответил не JSON-списком."""


def _utc(value: str | None) -> str | None:
    """'2026-11-05T18:21Z' → '2026-11-05T18:21:00Z'."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _hhmm(value: str | None) -> str | None:
    utc = _utc(value)
    return utc[11:16] if utc else None


def _join(parts: list[tuple[str, str]]) -> Text:
    return Text(", ".join(ru for ru, _ in parts), ", ".join(en for _, en in parts))


def _flr(item: dict) -> tuple[str | None, Text]:
    cls = item.get("classType") or "?"
    parts = [(f"Солнечная вспышка класса {cls}", f"Class {cls} solar flare")]
    if item.get("sourceLocation"):
        parts.append((f"область {item['sourceLocation']}", f"region {item['sourceLocation']}"))
    if peak := _hhmm(item.get("peakTime")):
        parts.append((f"пик {peak} UTC", f"peak {peak} UTC"))
    return item.get("beginTime"), _join(parts)


def _cme(item: dict) -> tuple[str | None, Text]:
    parts = [("Выброс корональной массы", "Coronal mass ejection")]
    analyses = item.get("cmeAnalyses") or []
    best = next((a for a in analyses if a.get("isMostAccurate")), analyses[0] if analyses else None)
    if best and best.get("speed"):
        speed = round(best["speed"])
        parts.append((f"скорость {speed} км/с", f"speed {speed} km/s"))
    if best and best.get("halfAngle"):
        half = round(best["halfAngle"])
        parts.append((f"полуугол {half}°", f"half-angle {half}°"))
    if item.get("sourceLocation"):
        parts.append((f"источник {item['sourceLocation']}", f"source {item['sourceLocation']}"))
    return item.get("startTime"), _join(parts)


def _sep(item: dict) -> tuple[str | None, Text]:
    instruments = [i.get("displayName") for i in item.get("instruments") or [] if i]
    ru, en = "Поток солнечных энергичных частиц", "Solar energetic particle event"
    if instruments:
        suffix = f" ({', '.join(instruments)})"
        ru, en = ru + suffix, en + suffix
    return item.get("eventTime"), Text(ru, en)


def _gst(item: dict) -> tuple[str | None, Text]:
    kp = [k.get("kpIndex") for k in item.get("allKpIndex") or [] if k.get("kpIndex") is not None]
    ru, en = "Геомагнитная буря у Земли", "Geomagnetic storm at Earth"
    if kp:
        ru += f", Kp до {max(kp):g}"
        en += f", Kp up to {max(kp):g}"
    return item.get("startTime"), Text(ru, en)


PARSERS = {"FLR": _flr, "CME": _cme, "SEP": _sep, "GST": _gst}


def normalize(event_type: str, items: list[dict]) -> list[dict]:
    events = []
    for item in items:
        if not isinstance(item, dict):
            continue
        start, summary = PARSERS[event_type](item)
        start_utc = _utc(start)
        if not start_utc:
            continue
        events.append({
            "type": event_type,
            "start_utc": start_utc,
            "summary": summary,
            "link": item.get("link") or "https://ccmc.gsfc.nasa.gov/tools/DONKI/",
        })
    return events


class DonkiService:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None,
                 base_url: str = DONKI_URL) -> None:
        self._transport = transport
        self._base_url = base_url
        self._cache: dict[int, tuple[float, dict]] = {}
        self._lock = asyncio.Lock()

    async def _fetch_type(self, client: httpx.AsyncClient, event_type: str,
                          start: str, end: str) -> list[dict]:
        response = await client.get(
            f"{self._base_url}/{event_type}", params={"startDate": start, "endDate": end}
        )
        response.raise_for_status()
        # Пустой период DONKI иногда отдаёт пустым телом вместо [].
        if not response.content.strip():
            return []
        try:
            data: Any = response.json()
        except ValueError as exc:
            raise DonkiUnavailable(
                Text(f"{event_type}: ответ не JSON", f"{event_type}: response is not JSON")
            ) from exc
        if not isinstance(data, list):
            raise DonkiUnavailable(
                Text(f"{event_type}: ожидался список", f"{event_type}: expected a list")
            )
        return normalize(event_type, data)

    async def _fetch(self, days: int) -> dict:
        today = datetime.now(UTC).date()
        start, end = (today - timedelta(days=days)).isoformat(), today.isoformat()
        async with httpx.AsyncClient(transport=self._transport, timeout=TIMEOUT_S,
                                     headers={"User-Agent": "martian-map"}) as client:
            try:
                chunks = await asyncio.gather(
                    *(self._fetch_type(client, t, start, end) for t in EVENT_TYPES)
                )
            except httpx.HTTPError as exc:
                raise DonkiUnavailable(str(exc) or type(exc).__name__) from exc
        events = [e for chunk in chunks for e in chunk]
        events.sort(key=lambda e: e["start_utc"], reverse=True)
        return {
            "source": "NASA DONKI",
            "fetched_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "note": NOTE,
            "events": events,
        }

    async def events(self, days: int) -> dict:
        async with self._lock:
            cached = self._cache.get(days)
            now = time.monotonic()
            if cached and now - cached[0] < CACHE_TTL_S:
                return cached[1]
            try:
                result = await self._fetch(days)
            except DonkiUnavailable:
                if cached and now - cached[0] < STALE_TTL_S:
                    return cached[1]
                raise
            self._cache[days] = (now, result)
            return result


_service = DonkiService()


def get_donki_service() -> DonkiService:
    return _service
