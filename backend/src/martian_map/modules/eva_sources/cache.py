# TTL-кэш в памяти и общий запрос JSON с единым форматом отказа источника.
import time
from typing import Any

import httpx

DEFAULT_TTL_S = 900.0
REQUEST_TIMEOUT_S = 20.0
_store: dict[str, tuple[float, Any]] = {}


def cache_get(key: str, ttl_s: float = DEFAULT_TTL_S) -> Any | None:
    entry = _store.get(key)
    if entry is None or time.monotonic() - entry[0] > ttl_s:
        _store.pop(key, None)
        return None
    return entry[1]


def cache_put(key: str, value: Any) -> None:
    _store[key] = (time.monotonic(), value)


def cache_clear() -> None:
    _store.clear()


def unavailable(detail: str) -> dict[str, str]:
    return {"status": "source_unavailable", "detail": detail}


async def fetch_json(url: str, params: dict[str, str] | None = None) -> Any:
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S, follow_redirects=True) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        return response.json()
