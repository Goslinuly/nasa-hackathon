"""Реал-тайм погода NOAA SWPC: протоны и рентген GOES и шкалы R/S/G, измеренные у Земли."""

import math
import os

from martian_map.modules.eva_sources import cache

DEFAULT_URL = "https://services.swpc.noaa.gov"
MAX_AGE_S = 10 * 60

EARTH_CAVEAT = (
    "Измерено аппаратами GOES на орбите Земли. Марс находится на другой гелиодолготе: "
    "поток частиц там может отличаться, а возмущение доходит от часов до суток"
)

S_SCALE_THRESHOLDS_PFU = ((5, 1e5), (4, 1e4), (3, 1e3), (2, 1e2), (1, 1e1))
XRAY_CLASSES = (("X", 1e-4), ("M", 1e-5), ("C", 1e-6), ("B", 1e-7), ("A", 1e-8))


def base_url() -> str:
    return os.environ.get("MARTIAN_SWPC_URL", DEFAULT_URL).rstrip("/")


def s_scale_of(flux_10mev_pfu: float) -> int:
    for level, threshold in S_SCALE_THRESHOLDS_PFU:
        if flux_10mev_pfu >= threshold:
            return level
    return 0


def xray_class_of(flux_wm2: float) -> str:
    if not math.isfinite(flux_wm2) or flux_wm2 <= 0:
        return "—"
    for letter, base in XRAY_CLASSES:
        if flux_wm2 >= base:
            return f"{letter}{min(flux_wm2 / base, 9.9):.1f}"
    return "A<1.0"


def _series_latest_and_max(rows: list, energy: str) -> tuple[float, float, str] | None:
    picked = [r for r in rows if isinstance(r, dict) and r.get("energy") == energy]
    values = [float(r["flux"]) for r in picked if isinstance(r.get("flux"), (int, float))]
    if not values:
        return None
    return values[-1], max(values), str(picked[-1].get("time_tag") or "")


async def fetch_conditions() -> dict:
    key = "swpc:conditions"
    cached = cache.cache_get(key, ttl_s=MAX_AGE_S)
    if cached is not None:
        return cached
    base = base_url()
    try:
        protons = await cache.fetch_json(f"{base}/json/goes/primary/integral-protons-1-day.json")
        xrays = await cache.fetch_json(f"{base}/json/goes/primary/xrays-1-day.json")
        scales = await cache.fetch_json(f"{base}/products/noaa-scales.json")
    except Exception as error:  # noqa: BLE001
        return cache.unavailable(f"NOAA SWPC недоступен: {type(error).__name__}")

    proton = _series_latest_and_max(protons if isinstance(protons, list) else [], ">=10 MeV")
    xray = _series_latest_and_max(xrays if isinstance(xrays, list) else [], "0.1-0.8nm")
    current = scales.get("0", {}) if isinstance(scales, dict) else {}
    if proton is None or xray is None:
        return cache.unavailable("NOAA SWPC вернул ряды без ожидаемых каналов")

    result = {
        "status": "ok",
        "source": "NOAA SWPC, GOES primary",
        "caveat": EARTH_CAVEAT,
        "proton_flux_10mev_pfu": proton[0],
        "proton_flux_10mev_max24h_pfu": proton[1],
        "proton_time_utc": proton[2],
        "s_scale_now": s_scale_of(proton[0]),
        "s_scale_max24h": s_scale_of(proton[1]),
        "xray_flux_wm2": xray[0],
        "xray_class": xray_class_of(xray[0]),
        "xray_time_utc": xray[2],
        "noaa_scales_now": {
            "R": (current.get("R") or {}).get("Scale"),
            "S": (current.get("S") or {}).get("Scale"),
            "G": (current.get("G") or {}).get("Scale"),
        },
        "units": {"proton_flux": "частиц/(см^2 с ср), >=10 МэВ", "xray_flux": "Вт/м^2, 0.1-0.8 нм"},
    }
    cache.cache_put(key, result)
    return result
