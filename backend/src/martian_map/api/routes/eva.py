# Роуты режима EVA: чистая физика (подвижность, возврат, радиация, уклоны) и живые источники NASA.
import math
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from martian_map.modules.eva import mobility, radiation, shielding, slopes, walkback
from martian_map.modules.eva_sources import gale_weather, rad_live, solar_events

router = APIRouter(prefix="/eva", tags=["eva"])



class ProfilePoint(BaseModel):
    distance_m: float = Field(ge=0, le=1e6, allow_inf_nan=False)
    slope_deg: float = Field(ge=-90, le=90, allow_inf_nan=False)


class MobilityProfileInput(BaseModel):
    points: list[ProfilePoint] = Field(min_length=1, max_length=5000)
    crew_kg: float = Field(default=80, gt=0, le=300, allow_inf_nan=False)
    load_kg: float = Field(default=45, ge=0, le=300, allow_inf_nan=False)
    surface: Literal["sand", "firm"] = "firm"


class WalkbackPoint(BaseModel):
    distance_from_base_m: float = Field(ge=0, le=1e7, allow_inf_nan=False)


class WalkbackInput(BaseModel):
    points: list[WalkbackPoint] = Field(min_length=1, max_length=5000)
    o2_remaining_l: float = Field(ge=0, le=1e5, allow_inf_nan=False)


@router.post("/mobility-profile")
def mobility_profile(query: MobilityProfileInput) -> dict:
    segments = []
    time_s = 0.0
    o2_low_l = 0.0
    o2_high_l = 0.0
    previous = query.points[0].distance_m
    for point in query.points[1:]:
        length_m = max(point.distance_m - previous, 0.0)
        previous = point.distance_m
        speed = mobility.walk_speed(point.slope_deg)
        v_ms = speed.speed_ms
        grade_pct = math.tan(math.radians(point.slope_deg)) * 100.0
        powers = [
            mobility.mars_power_corridor(query.crew_kg, query.load_kg, v_ms, grade_pct, eta)
            for eta in set(mobility.terrain_factor(query.surface, v_ms))
        ]
        power_low = max(min(p[0] for p in powers), 0.0)
        power_high = max(max(p[1] for p in powers), 0.0)
        o2_rate = (mobility.oxygen_rate_lpm(power_low), mobility.oxygen_rate_lpm(power_high))
        seg_time_s = length_m / v_ms
        time_s += seg_time_s
        o2_low_l += o2_rate[0] * seg_time_s / 60.0
        o2_high_l += o2_rate[1] * seg_time_s / 60.0
        segments.append(
            {
                "length_m": length_m,
                "slope_deg": point.slope_deg,
                "speed_m_s": v_ms,
                "status": speed.status,
                "power_w": {"low": power_low, "high": power_high, "unit": "W"},
                "o2_rate_lpm": {"low": o2_rate[0], "high": o2_rate[1], "unit": "L/min"},
                "speed_info": speed.to_dict(),
                "slope_class": slopes.classify_slope(point.slope_deg).to_dict(),
            }
        )
    return {
        "segments": segments,
        "totals": {
            "time_s": time_s,
            "o2_l": {"low": o2_low_l, "high": o2_high_l, "unit": "L"},
        },
        "inputs": {"crew_kg": query.crew_kg, "load_kg": query.load_kg, "surface": query.surface},
        "provenance": {
            "speed": mobility.SPEED_PROVENANCE.to_dict(),
            "terrain": mobility.TERRAIN_PROVENANCE.to_dict(),
            "power": mobility.CORRIDOR_PROVENANCE.to_dict(),
            "oxygen": mobility.OXYGEN_PROVENANCE.to_dict(),
            "time_note": "Время = сумма длина/скорость; коридор времени не строится.",
        },
    }


@router.post("/walkback")
def walkback_route(query: WalkbackInput) -> dict:
    points = [{"distance_from_base_m": p.distance_from_base_m} for p in query.points]
    return walkback.walkback_check(points, query.o2_remaining_l).to_dict()


@router.get("/radiation")
def radiation_route(
    pressure_pa: float | None = Query(default=None, gt=0, le=2000, allow_inf_nan=False),
    delta_h_m: float | None = Query(default=None, ge=-10000, le=30000, allow_inf_nan=False),
) -> dict:
    body = {
        "dose_corridor": radiation.dose_corridor().to_dict(),
        "quality_factors": [q.to_dict() for q in radiation.quality_factors()],
        "solar_event_facts": [radiation.SOLAR_EVENT_FACT, radiation.SOLAR_MONTH_FACT],
    }
    if pressure_pa is not None:
        body["pressure_correction"] = radiation.pressure_correction(pressure_pa).to_dict()
    if delta_h_m is not None:
        body["elevation_correction"] = radiation.elevation_correction(delta_h_m).to_dict()
    return body


@router.get("/slopes")
def slopes_route() -> dict:
    return {
        "thresholds": [t.to_dict() for t in slopes.thresholds()],
        "facts": [f.to_dict() for f in slopes.facts()],
    }


@router.get("/shielding")
def shielding_route(sky_view: float = Query(default=1.0, ge=0, le=1, allow_inf_nan=False)) -> dict:
    corridor = radiation.dose_corridor()
    return {
        "sky_view": sky_view,
        "open_dose_units": corridor.units,
        "shielded_dose": {
            name: shielding.shielded_dose(open_dose, sky_view).to_dict()
            for name, open_dose in (
                ("low", corridor.low),
                ("mid", corridor.mid),
                ("high", corridor.high),
            )
        },
        "validation_facts": shielding.validation_facts().to_dict(),
    }


@router.get("/rad-live")
async def rad_live_route(days: int = Query(default=30, ge=1, le=rad_live.MAX_DAYS)) -> dict:
    result = await rad_live.fetch_rad(days)
    if result.get("status") != "ok":
        return result
    default_quality = radiation.quality_factors()[0]
    series = []
    for row in result["series"]:
        converted = radiation.convert_ugy_to_msv(row["dose_ugy_per_sol"], default_quality)
        series.append(
            {
                **row,
                "dose_msv_per_sol": converted.msv,
                "dose_msv_low": converted.msv_low,
                "dose_msv_high": converted.msv_high,
            }
        )
    return {
        **result,
        "series": series,
        "quality_factor": radiation.DEFAULT_QUALITY,
        "quality_factor_status": "по умолчанию (QUALITY_VARIANTS модуля radiation)",
        "dose_msv_unit": "mSv/sol",
    }


@router.get("/solar-events")
async def solar_events_route(days: int = Query(default=14, ge=1, le=solar_events.MAX_DAYS)) -> dict:
    return await solar_events.fetch_events(days)


@router.get("/conditions")
async def conditions_route(
    history: int = Query(default=7, ge=0, le=gale_weather.MAX_HISTORY),
) -> dict:
    return await gale_weather.fetch_conditions(history)
