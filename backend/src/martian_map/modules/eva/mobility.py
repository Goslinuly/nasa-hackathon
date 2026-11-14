"""Скорость ходьбы и метаболическая мощность EVA по модели Санти для марсианской тяжести."""

from dataclasses import dataclass

from martian_map.modules.eva.provenance import ALGORITHM_VERSION, Provenance, to_plain

FLAT_SPEED = 0.75
FLAT_SPEED_LABEL = (
    "Скорость на ровном месте; факт: средняя по 38 эпизодам лунных выходов 0.728 м/с"
)
TREADMILL_LIMIT = 1.74
TREADMILL_LIMIT_LABEL = "Идеальная беговая дорожка: предел, а не рабочая скорость"
SLOPE_DOMAIN = (-20.0, 20.0)
MARS_GRAVITY_FACTOR = 0.38
WATTS_PER_LPM_O2 = 348.3
DESIGN_EVA_HOURS = 8
DESIGN_AVG_W = 350
DESIGN_PEAK_W = 530
APOLLO_ACTUAL_AVG_W = 273

GRAVITY_MODES = ("nasa_tool", "inertial_kept")

SPEED_PROVENANCE = Provenance(
    source="Линейная модель скорости ходьбы от уклона V = -0.01*slope + 0.75",
    status="model",
    units="м/с; уклон в градусах, область определения от -20 до +20",
    note=FLAT_SPEED_LABEL,
)
TERRAIN_PROVENANCE = Provenance(
    source="Коэффициент грунта eta: песок 1.5 + 1.3/v^2, плотный грунт 1.0-1.2",
    status="model",
    units="безразмерный множитель метаболической мощности",
)
POWER_PROVENANCE = Provenance(
    source="Метаболическая модель Санти с поправкой спуска при уклоне <= 0",
    status="model",
    units="Вт; масса в кг, скорость в м/с, уклон в процентах",
    note=(
        "nasa_tool: весь результат на 0.38; "
        "inertial_kept: инерция конечностей без масштабирования"
    ),
)
CORRIDOR_PROVENANCE = Provenance(
    source="Коридор двух режимов тяжести: от меньшего к большему",
    status="estimate",
    units="Вт",
    note=(
        "Прямое измерение показало метаболизм на марсианской тяжести выше лунного, "
        "инерционный член от тяжести не зависит, поэтому истина между режимами"
    ),
)
OXYGEN_PROVENANCE = Provenance(
    source="Расход кислорода = мощность / 348.3 при дыхательном коэффициенте 0.85",
    status="model",
    units="л/мин",
)
DESIGN_PROVENANCE = Provenance(
    source="Проектные параметры выхода и фактическая средняя мощность Apollo",
    status="operational_rule",
    units="часы и Вт",
)

DESIGN_FACTS: tuple[dict[str, object], ...] = (
    {
        "key": "eva_hours",
        "value": DESIGN_EVA_HOURS,
        "units": "ч",
        "label": "Проектная длительность выхода",
    },
    {"key": "avg_w", "value": DESIGN_AVG_W, "units": "Вт", "label": "Проектная средняя мощность"},
    {"key": "peak_w", "value": DESIGN_PEAK_W, "units": "Вт", "label": "Проектная пиковая мощность"},
    {
        "key": "apollo_avg_w",
        "value": APOLLO_ACTUAL_AVG_W,
        "units": "Вт",
        "label": "Фактическая средняя мощность Apollo",
    },
)


@dataclass(frozen=True)
class SpeedResult:
    speed_ms: float
    slope_deg: float
    status: str
    label: str
    provenance: Provenance
    version: str = ALGORITHM_VERSION

    def to_dict(self) -> dict[str, object]:
        return to_plain(self)


@dataclass(frozen=True)
class PowerCorridor:
    low_w: float
    high_w: float
    low_mode: str
    high_mode: str
    provenance: Provenance
    version: str = ALGORITHM_VERSION

    def to_dict(self) -> dict[str, object]:
        return to_plain(self)


def walk_speed(slope_deg: float) -> SpeedResult:
    low, high = SLOPE_DOMAIN
    inside = low <= slope_deg <= high
    clamped = min(max(slope_deg, low), high)
    label = (
        "Скорость по модели"
        if inside
        else "Уклон вне области определения модели, скорость на границе"
    )
    status = "ok" if inside else "outside_model_domain"
    return SpeedResult(-0.01 * clamped + FLAT_SPEED, slope_deg, status, label, SPEED_PROVENANCE)


def terrain_factor(surface: str, v_ms: float) -> tuple[float, float]:
    if surface == "sand":
        eta = 1.5 + 1.3 / v_ms**2
        return (eta, eta)
    if surface == "firm":
        return (1.0, 1.2)
    raise ValueError(f"unknown surface: {surface}")


def _terms(
    crew_kg: float, load_kg: float, v_ms: float, grade_pct: float, eta: float
) -> tuple[float, float, float, float, float]:
    total = crew_kg + load_kg
    t1 = 1.5 * crew_kg
    t2 = 2.0 * total * (load_kg / crew_kg) ** 2
    t3a = eta * total * 1.5 * v_ms**2
    t3b = eta * total * 0.35 * v_ms * grade_pct
    cf = 0.0
    if grade_pct <= 0:
        cf = eta * (
            grade_pct * total * v_ms / 3.5
            - total * (grade_pct + 6) ** 2 / crew_kg
            + (25 - v_ms**2)
        )
    return t1, t2, t3a, t3b, cf


def metabolic_power(
    crew_kg: float, load_kg: float, v_ms: float, grade_pct: float, eta: float, gravity_mode: str
) -> float:
    if gravity_mode not in GRAVITY_MODES:
        raise ValueError(f"unknown gravity_mode: {gravity_mode}")
    t1, t2, t3a, t3b, cf = _terms(crew_kg, load_kg, v_ms, grade_pct, eta)
    if gravity_mode == "nasa_tool":
        return MARS_GRAVITY_FACTOR * (t1 + t2 + t3a + t3b - cf)
    return MARS_GRAVITY_FACTOR * (t1 + t2 + t3b - cf) + t3a


def mars_power_corridor(
    crew_kg: float, load_kg: float, v_ms: float, grade_pct: float, eta: float
) -> tuple[float, float]:
    detail = mars_power_corridor_detail(crew_kg, load_kg, v_ms, grade_pct, eta)
    return (detail.low_w, detail.high_w)


def mars_power_corridor_detail(
    crew_kg: float, load_kg: float, v_ms: float, grade_pct: float, eta: float
) -> PowerCorridor:
    by_mode = {
        mode: metabolic_power(crew_kg, load_kg, v_ms, grade_pct, eta, mode)
        for mode in GRAVITY_MODES
    }
    low_mode = min(by_mode, key=lambda m: by_mode[m])
    high_mode = max(by_mode, key=lambda m: by_mode[m])
    return PowerCorridor(
        by_mode[low_mode], by_mode[high_mode], low_mode, high_mode, CORRIDOR_PROVENANCE
    )


def oxygen_rate_lpm(power_w: float) -> float:
    return power_w / WATTS_PER_LPM_O2
