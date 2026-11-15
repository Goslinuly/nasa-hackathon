"""Радиация на поверхности Марса: коридор дозы, коэффициент качества, поправки давления и высоты."""

from dataclasses import dataclass

from martian_map.i18n import Text
from martian_map.modules.eva.provenance import ALGORITHM_VERSION, Provenance, to_plain

TYPICAL_MSV_PER_SOL = 0.64
TYPICAL_SPREAD_MSV = 0.12
SOLAR_CYCLE_RANGE_MSV = (0.25, 0.95)
DEFAULT_QUALITY = 3.05
BASE_UGY_PER_SOL = 220.0
BASE_PRESSURE_PA = 840.0
K_RANGE = (0.10, 0.22)
PRESSURE_VALID_RANGE_PA = (600.0, 1200.0)
ELEVATION_UGY_PER_SOL_PER_100M = 4.0
ELEVATION_MEASURED_LIMIT_M = 500.0

SOLAR_EVENT_FACT = Text(
    "Сильнейшее событие за 8 лет добавило на поверхности примерно столько, "
    "сколько даёт фон за 1.5-2 суток",
    "The strongest event in 8 years added at the surface about as much "
    "as the background gives in 1.5-2 days",
)
SOLAR_MONTH_FACT = Text(
    "За 30 дней суммарная доза почти не изменилась: спад фона скомпенсировал выброс",
    "Over 30 days the total dose barely changed: the drop in background offset the event",
)
DOSE_UNITS = Text("мЗв/сол", "mSv/sol")

DOSE_PROVENANCE = Provenance(
    source=Text(
        "Измеренная эквивалентная доза на поверхности, типичное значение 0.64 мЗв/сол",
        "Measured surface dose equivalent, typical value 0.64 mSv/sol",
    ),
    status="measurement",
    units=DOSE_UNITS,
    note=Text(
        "Диапазон 0.25-0.95 мЗв/сол задаёт солнечный цикл; одним числом не подавать",
        "The 0.25-0.95 mSv/sol range is set by the solar cycle; "
        "do not present it as a single number",
    ),
)
QUALITY_PROVENANCE = Provenance(
    source=Text(
        "Варианты коэффициента качества излучения из литературы",
        "Radiation quality factor variants from the literature",
    ),
    status="estimate",
    units=Text("безразмерный", "dimensionless"),
    note=Text(
        "Перевод поглощённой дозы в эквивалентную; значение по умолчанию 3.05",
        "Converts absorbed dose to dose equivalent; the default value is 3.05",
    ),
)
CONVERSION_PROVENANCE = Provenance(
    source=Text(
        "Эквивалентная доза = поглощённая доза * коэффициент качества",
        "Dose equivalent = absorbed dose * quality factor",
    ),
    status="model",
    units=Text("мкГр -> мЗв", "µGy -> mSv"),
)
PRESSURE_PROVENANCE = Provenance(
    source=Text(
        "Эмпирическая зависимость дозы от давления: 220 - K*(p - 840), "
        "K 0.10-0.22 мкГр/сол на Па",
        "Empirical dose-pressure relation: 220 - K*(p - 840), "
        "K 0.10-0.22 µGy/sol per Pa",
    ),
    status="model",
    units=Text("мкГр/сол; давление в Па", "µGy/sol; pressure in Pa"),
    note=Text(
        "Эмпирическая зависимость, только для приповерхностных давлений около 600-1200 Па",
        "An empirical relation, valid only for near-surface pressures of about 600-1200 Pa",
    ),
)
ELEVATION_PROVENANCE = Provenance(
    source=Text(
        "Подъём Curiosity примерно на 150 м дал +6 мкГр/сол, около +4 мкГр/сол на 100 м вверх",
        "Curiosity's climb of about 150 m gave +6 µGy/sol, about +4 µGy/sol per 100 m up",
    ),
    status="measurement",
    units=Text("мкГр/сол; высота в метрах", "µGy/sol; height in meters"),
    note=Text(
        "Для |dh| до 500 м измерено, дальше оценка",
        "Measured for |dh| up to 500 m, an estimate beyond that",
    ),
)

QUALITY_VARIANTS: tuple[dict[str, object], ...] = (
    {
        "value": 3.05,
        "spread": 0.3,
        "label": Text("поверхность, самая цитируемая работа", "surface, the most cited study"),
        "default": True,
    },
    {
        "value_range": (2.1, 2.7),
        "label": Text(
            "уточнение 2019, меньше при толще атмосферы",
            "2019 refinement, lower under a thicker atmosphere",
        ),
        "default": False,
    },
    {
        "value": 1.2,
        "label": Text("разгар солнечного события", "peak of a solar event"),
        "default": False,
    },
)


@dataclass(frozen=True)
class DoseCorridor:
    low: float
    mid: float
    high: float
    range_low: float
    range_high: float
    units: str
    provenance: Provenance
    version: str = ALGORITHM_VERSION

    def to_dict(self) -> dict[str, object]:
        return to_plain(self)


@dataclass(frozen=True)
class QualityFactor:
    low: float
    mid: float
    high: float
    label: str
    default: bool
    provenance: Provenance

    def to_dict(self) -> dict[str, object]:
        return to_plain(self)


@dataclass(frozen=True)
class DoseConversion:
    dose_ugy: float
    quality_mid: float
    msv_low: float
    msv: float
    msv_high: float
    provenance: Provenance
    version: str = ALGORITHM_VERSION

    def to_dict(self) -> dict[str, object]:
        return to_plain(self)


@dataclass(frozen=True)
class PressureCorrection:
    pressure_pa: float
    low: float
    mid: float
    high: float
    status: str
    provenance: Provenance
    version: str = ALGORITHM_VERSION

    def to_dict(self) -> dict[str, object]:
        return to_plain(self)


@dataclass(frozen=True)
class ElevationCorrection:
    delta_h_m: float
    delta_ugy_per_sol: float
    status: str
    provenance: Provenance
    version: str = ALGORITHM_VERSION

    def to_dict(self) -> dict[str, object]:
        return to_plain(self)


def dose_corridor() -> DoseCorridor:
    mid = TYPICAL_MSV_PER_SOL
    return DoseCorridor(
        mid - TYPICAL_SPREAD_MSV,
        mid,
        mid + TYPICAL_SPREAD_MSV,
        SOLAR_CYCLE_RANGE_MSV[0],
        SOLAR_CYCLE_RANGE_MSV[1],
        DOSE_UNITS,
        DOSE_PROVENANCE,
    )


def _bounds(variant: dict[str, object]) -> tuple[float, float, float]:
    if "value_range" in variant:
        low, high = variant["value_range"]  # type: ignore[misc]
        return (low, (low + high) / 2, high)
    value = float(variant["value"])  # type: ignore[arg-type]
    spread = float(variant.get("spread", 0.0))  # type: ignore[arg-type]
    return (value - spread, value, value + spread)


def quality_factors() -> list[QualityFactor]:
    result = []
    for variant in QUALITY_VARIANTS:
        low, mid, high = _bounds(variant)
        result.append(
            QualityFactor(
                low,
                mid,
                high,
                variant["label"],  # type: ignore[arg-type]
                bool(variant["default"]),
                QUALITY_PROVENANCE,
            )
        )
    return result


def convert_ugy_to_msv(
    dose_ugy: float, quality: float | QualityFactor = DEFAULT_QUALITY
) -> DoseConversion:
    if isinstance(quality, QualityFactor):
        low, mid, high = quality.low, quality.mid, quality.high
    else:
        low = mid = high = float(quality)
    return DoseConversion(
        dose_ugy,
        mid,
        dose_ugy * low / 1000,
        dose_ugy * mid / 1000,
        dose_ugy * high / 1000,
        CONVERSION_PROVENANCE,
    )


def pressure_correction(pressure_pa: float) -> PressureCorrection:
    delta = pressure_pa - BASE_PRESSURE_PA
    doses = [BASE_UGY_PER_SOL - k * delta for k in K_RANGE]
    mid = BASE_UGY_PER_SOL - sum(K_RANGE) / 2 * delta
    low_p, high_p = PRESSURE_VALID_RANGE_PA
    status = "empirical" if low_p <= pressure_pa <= high_p else "extrapolated"
    return PressureCorrection(pressure_pa, min(doses), mid, max(doses), status, PRESSURE_PROVENANCE)


def elevation_correction(delta_h_m: float) -> ElevationCorrection:
    delta = ELEVATION_UGY_PER_SOL_PER_100M * delta_h_m / 100
    status = "measured" if abs(delta_h_m) <= ELEVATION_MEASURED_LIMIT_M else "estimated"
    return ElevationCorrection(delta_h_m, delta, status, ELEVATION_PROVENANCE)
