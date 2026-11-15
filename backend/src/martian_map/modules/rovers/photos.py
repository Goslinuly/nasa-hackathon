"""Сырые снимки Perseverance и Curiosity по солу: официальные ленты mars.nasa.gov, без ключей."""

from martian_map.i18n import Text
from martian_map.modules.eva_sources import cache

M2020_URL = (
    "https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json"
    "&num=48&page=0&order=sol+desc&sol={sol}"
)
MSL_URL = (
    "https://mars.nasa.gov/api/v1/raw_image_items/?order=sol+desc&per_page=48&page=0"
    "&condition_1=msl:mission&condition_2={sol}:sol:gte&condition_3={sol}:sol:lte"
)
ROVERS = {
    "perseverance": {"max_sol": 2200, "credit": "NASA/JPL-Caltech/ASU"},
    "curiosity": {"max_sol": 5200, "credit": "NASA/JPL-Caltech/MSSS"},
}
PREFERRED = ("NAV", "MCZ", "MAST")
CAVEAT = Text(
    "Снимок сделан ровером из точки его трека, а не с вашего маршрута: "
    "это представление о характере местности, не вид из вашей точки",
    "The image was taken by the rover from a point on its own track, not from your route: "
    "it shows what the terrain is like, not the view from your point",
)
TTL_S = 24 * 3600


def _score(instrument: str) -> int:
    for rank, prefix in enumerate(PREFERRED):
        if instrument.startswith(prefix):
            return rank
    return len(PREFERRED)


def parse_m2020(payload: object, limit: int) -> list[dict]:
    if not isinstance(payload, dict) or not isinstance(payload.get("images"), list):
        raise ValueError("лента mars2020 без массива images")
    rows = []
    for img in payload["images"]:
        if not isinstance(img, dict) or img.get("sample_type") != "Full":
            continue
        files = img.get("image_files") or {}
        url = files.get("medium") or files.get("small")
        instrument = ((img.get("camera") or {}).get("instrument")) or ""
        if not url or not instrument:
            continue
        rows.append(
            {
                "sol": img.get("sol"),
                "instrument": instrument,
                "time_utc": img.get("date_taken_utc"),
                "url": url,
            }
        )
    rows.sort(key=lambda r: _score(r["instrument"]))
    return rows[:limit]


def parse_msl(payload: object, limit: int) -> list[dict]:
    if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
        raise ValueError("лента MSL без массива items")
    rows = []
    for img in payload["items"]:
        if not isinstance(img, dict):
            continue
        url = img.get("url")
        instrument = img.get("instrument") or ""
        if not url or not instrument:
            continue
        rows.append({"sol": img.get("sol"), "instrument": instrument, "time_utc": None, "url": url})
    rows.sort(key=lambda r: _score(r["instrument"]))
    return rows[:limit]


async def fetch_photos(rover: str, sol: int, limit: int = 6) -> dict:
    meta = ROVERS.get(rover)
    if meta is None:
        return cache.unavailable(Text(f"неизвестный ровер {rover}", f"unknown rover {rover}"))
    sol = max(0, min(int(sol), meta["max_sol"]))
    limit = max(1, min(int(limit), 12))
    key = f"rover-photos:{rover}:{sol}:{limit}"
    cached = cache.cache_get(key, ttl_s=TTL_S)
    if cached is not None:
        return cached
    url = (M2020_URL if rover == "perseverance" else MSL_URL).format(sol=sol)
    try:
        payload = await cache.fetch_json(url)
        photos = (parse_m2020 if rover == "perseverance" else parse_msl)(payload, limit)
    except Exception as error:  # noqa: BLE001
        return cache.unavailable(
            Text(
                f"лента снимков NASA недоступна: {type(error).__name__}",
                f"NASA image feed unavailable: {type(error).__name__}",
            )
        )
    result = {
        "status": "ok",
        "rover": rover,
        "sol": sol,
        "count": len(photos),
        "photos": photos,
        "source": Text(
            "mars.nasa.gov, официальная лента сырых снимков миссии",
            "mars.nasa.gov, the mission's official raw image feed",
        ),
        "credit": meta["credit"],
        "caveat": CAVEAT,
    }
    cache.cache_put(key, result)
    return result
