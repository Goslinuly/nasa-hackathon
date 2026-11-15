# Роуты режима EVA: чистая физика (подвижность, возврат, радиация, уклоны) и живые источники NASA.
import math
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from martian_map.api.lang import LocalizedRoute
from martian_map.i18n import Text
from martian_map.modules.eva import mobility, radiation, shielding, slopes, walkback
from martian_map.modules.eva_sources import gale_weather, rad_live, solar_events, swpc
from martian_map.modules.space_weather.donki import DonkiUnavailable, get_donki_service

router = APIRouter(route_class=LocalizedRoute, prefix="/eva", tags=["eva"])


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
            "time_note": Text(
                "Время = сумма длина/скорость; коридор времени не строится.",
                "Time = sum of length/speed; no time corridor is built.",
            ),
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
        "quality_factor_status": Text(
            "по умолчанию (QUALITY_VARIANTS модуля radiation)",
            "default (QUALITY_VARIANTS of the radiation module)",
        ),
        "dose_msv_unit": "mSv/sol",
    }


@router.get("/solar-events")
async def solar_events_route(days: int = Query(default=14, ge=1, le=solar_events.MAX_DAYS)) -> dict:
    return await solar_events.fetch_events(days)


SOL_SECONDS = 88775.244


class RouteDoseInput(BaseModel):
    seconds: float = Field(gt=0, le=2 * SOL_SECONDS, allow_inf_nan=False)
    delta_h_m: float | None = Field(default=None, ge=-10000, le=30000, allow_inf_nan=False)


@router.post("/route-dose")
def route_dose(query: RouteDoseInput) -> dict:
    corridor = radiation.dose_corridor()
    fraction = query.seconds / SOL_SECONDS
    shift_msv_per_sol = 0.0
    elevation = None
    if query.delta_h_m is not None:
        correction = radiation.elevation_correction(query.delta_h_m)
        quality = radiation.quality_factors()[0]
        converted = radiation.convert_ugy_to_msv(abs(correction.delta_ugy_per_sol), quality)
        shift_msv_per_sol = converted.msv if correction.delta_ugy_per_sol >= 0 else -converted.msv
        elevation = correction.to_dict()
    dose = {
        "low": max((corridor.low + shift_msv_per_sol) * fraction, 0.0),
        "mid": max((corridor.mid + shift_msv_per_sol) * fraction, 0.0),
        "high": max((corridor.high + shift_msv_per_sol) * fraction, 0.0),
        "units": Text("мЗв за выход", "mSv per EVA"),
    }
    return {
        "dose_msv": dose,
        "fraction_of_sol": fraction,
        "rate_corridor": corridor.to_dict(),
        "elevation_correction": elevation,
        "provenance": {
            "source": Text(
                "Коридор типичной дозы RAD, поправка высоты и время выхода по модели",
                "Typical RAD dose corridor, elevation correction and modeled EVA time",
            ),
            "status": "model",
            "units": Text("мЗв", "mSv"),
            "note": Text(
                "Доза = скорость набора, умноженная на долю сола в пути;"
                " расход у людей и фон меняются",
                "Dose = dose rate times the fraction of a sol spent on the route;"
                " individual consumption and the background vary",
            ),
        },
    }


ADVISORY_RAD_RATIO = 1.3


@router.get("/space-weather")
async def eva_space_weather() -> dict:
    mars: dict = {
        "status": "source_unavailable",
        "detail": Text("фон RAD не получен", "RAD background not received"),
    }
    rad = await rad_live.fetch_rad(30)
    if rad.get("status") == "ok" and rad.get("series"):
        rates = sorted(row["dose_ugy_per_sol"] for row in rad["series"])
        median = rates[len(rates) // 2]
        latest = rad["series"][-1]
        ratio = latest["dose_ugy_per_sol"] / median if median > 0 else 1.0
        mars = {
            "status": "ok",
            "latest_ugy_per_sol": latest["dose_ugy_per_sol"],
            "latest_time": latest["time"],
            "median_30d_ugy_per_sol": median,
            "ratio_to_median": ratio,
            "source": rad.get("source"),
            "note": Text(
                "Единственное прямое измерение фона на поверхности Марса;"
                " обновляется с задержкой до пары суток",
                "The only direct measurement of the background at the Martian surface;"
                " updated with a delay of up to a couple of days",
            ),
        }
    earth = await swpc.fetch_conditions()
    donki_silent = Text("DONKI не отвечает", "DONKI is not responding")
    events: dict = {"status": "source_unavailable", "detail": donki_silent}
    try:
        donki = await get_donki_service().events(7)
        events = {"status": "ok", **donki, "events": donki.get("events", [])[:6]}
    except DonkiUnavailable as error:
        # str() отбросил бы английский вариант у Text; берём исходный аргумент.
        detail = error.args[0] if error.args and isinstance(error.args[0], str) else ""
        events = {"status": "source_unavailable", "detail": detail or donki_silent}

    reasons: list[str] = []
    level = "calm"
    if mars.get("status") == "ok" and mars["ratio_to_median"] > ADVISORY_RAD_RATIO:
        level = "elevated"
        ratio = mars["ratio_to_median"]
        reasons.append(
            Text(
                f"фон RAD на Марсе в {ratio:.2f} раза выше медианы 30 солов (измерение)",
                f"RAD background on Mars is {ratio:.2f} times the 30-sol median (measurement)",
            )
        )
    if earth.get("status") == "ok" and earth.get("s_scale_max24h", 0) >= 1:
        level = "event_at_earth" if level == "calm" else level
        storm = earth["s_scale_max24h"]
        reasons.append(
            Text(
                f"у Земли радиационная буря S{storm} за последние сутки (к Марсу — оценка)",
                f"S{storm} radiation storm at Earth in the last 24 hours (for Mars, an estimate)",
            )
        )
    if not reasons:
        reasons.append(
            Text(
                "фон в пределах обычного; прямых признаков события нет",
                "background within the usual range; no direct signs of an event",
            )
        )

    return {
        "mars_measured": mars,
        "earth_measured": earth,
        "events": events,
        "advisory": {
            "level": level,
            "reasons": reasons,
            "provenance": {
                "source": Text(
                    "Сводка: RAD на Марсе как главный признак,"
                    " GOES и DONKI у Земли как ранний",
                    "Summary: RAD on Mars as the main signal,"
                    " GOES and DONKI at Earth as the early one",
                ),
                "status": "model",
                "units": Text(
                    "уровни calm, elevated, event_at_earth",
                    "levels calm, elevated, event_at_earth",
                ),
                "note": Text(
                    f"Порог повышенного фона: {ADVISORY_RAD_RATIO} медианы;"
                    " порог события: S1 у Земли",
                    f"Elevated background threshold: {ADVISORY_RAD_RATIO} × median;"
                    " event threshold: S1 at Earth",
                ),
            },
        },
    }


@router.get("/conditions")
async def conditions_route(
    history: int = Query(default=7, ge=0, le=gale_weather.MAX_HISTORY),
) -> dict:
    return await gale_weather.fetch_conditions(history)
