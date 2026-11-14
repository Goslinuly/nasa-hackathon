"""Правило возврата к базе: хватит ли кислорода на путь назад и резерв при аварийной мощности."""

from dataclasses import dataclass

from martian_map.modules.eva.mobility import WATTS_PER_LPM_O2
from martian_map.modules.eva.provenance import ALGORITHM_VERSION, Provenance, to_plain

RETURN_SPEED_KMH = 3.3
EMERGENCY_W = 422
RESERVE_MIN = 30
APOLLO_ROVER_LIMIT_KM = 7.6
APOLLO_WALK_LIMIT_KM = 3.1
APOLLO_LIMITS: tuple[dict[str, object], ...] = (
    {"km": APOLLO_ROVER_LIMIT_KM, "label": "Предел Apollo на транспорте (не пеший радиус)"},
    {
        "km": APOLLO_WALK_LIMIT_KM,
        "label": "Пеший радиус Apollo (не путать с пределом на транспорте)",
    },
)
LIMITING_RESOURCE_FACT = (
    "Для пеших траверсов ограничивающий ресурс обычно вода на охлаждение, а не кислород"
)

PROVENANCE = Provenance(
    source=(
        "Правило возврата: путь назад на 3.3 км/ч при 422 Вт (с надбавкой 20%) "
        "и резерв 30 минут"
    ),
    status="operational_rule",
    units="кислород в литрах, время в минутах, расстояние в метрах",
    note=(
        "Принцип: возврат при любом одиночном отказе; двойной отказ не планируется. "
        "Выходы выполняются парой: напарник — живой резерв на этот отказ "
        "(помощь при падении, общий ориентир, подстраховка расходников), "
        "а запас каждого считается на одного. "
        + LIMITING_RESOURCE_FACT
    ),
)


@dataclass(frozen=True)
class PointCheck:
    distance_from_base_m: float
    allowed: bool
    t_return_min: float
    o2_need_l: float
    margin_l: float


@dataclass(frozen=True)
class WalkbackResult:
    points: list[PointCheck]
    farthest_allowed_m: float | None
    o2_remaining_l: float
    elapsed_min: float
    provenance: Provenance
    version: str = ALGORITHM_VERSION

    def to_dict(self) -> dict[str, object]:
        return to_plain(self)


def o2_for_minutes(minutes: float) -> float:
    return EMERGENCY_W / WATTS_PER_LPM_O2 * minutes


def check_point(distance_m: float, o2_remaining_l: float) -> PointCheck:
    t_return = distance_m / (RETURN_SPEED_KMH * 1000 / 60)
    need = o2_for_minutes(t_return) + o2_for_minutes(RESERVE_MIN)
    margin = o2_remaining_l - need
    return PointCheck(distance_m, margin >= 0, t_return, need, margin)


def walkback_check(
    points: list[dict], o2_remaining_l: float, elapsed_min: float = 0.0
) -> WalkbackResult:
    checks = [check_point(float(p["distance_from_base_m"]), o2_remaining_l) for p in points]
    allowed = [c.distance_from_base_m for c in checks if c.allowed]
    farthest = max(allowed) if allowed else None
    return WalkbackResult(checks, farthest, o2_remaining_l, elapsed_min, PROVENANCE)
