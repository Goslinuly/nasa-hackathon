"""Пороги уклона для пеших выходов: природа каждого порога, факты и классификация уклона."""

from dataclasses import dataclass

from martian_map.modules.eva.provenance import ALGORITHM_VERSION, Provenance, to_plain

NO_NASA_REQUIREMENT = (
    "Численного требования к уклону в стандарте NASA по здоровью экипажа нет "
    "(проверен полный текст); "
    "ссылаться на требование NASA 20 градусов нельзя"
)

PROVENANCE = Provenance(
    source="Эксплуатационные правила и ориентиры сообщества, не стандарт здоровья экипажа",
    status="operational_rule",
    units="градусы",
    note=NO_NASA_REQUIREMENT,
)


@dataclass(frozen=True)
class SlopeThreshold:
    key: str
    low_deg: float
    high_deg: float
    nature: str
    label: str

    def to_dict(self) -> dict[str, object]:
        return to_plain(self)


@dataclass(frozen=True)
class SlopeFact:
    key: str
    text: str
    status: str

    def to_dict(self) -> dict[str, object]:
        return to_plain(self)


@dataclass(frozen=True)
class SlopeClass:
    slope_deg: float
    level: str
    label: str
    notes: list[str]
    provenance: Provenance
    version: str = ALGORITHM_VERSION

    def to_dict(self) -> dict[str, object]:
        return to_plain(self)


_THRESHOLDS: tuple[SlopeThreshold, ...] = (
    SlopeThreshold(
        "planning_tool_limit", -20, 20, "operational_rule",
        "Действующее эксплуатационное правило инструмента планирования NASA: круче исключается",
    ),
    SlopeThreshold(
        "community_walkable", -25, 25, "community_guideline", "Ориентир сообщества: доступно пешком"
    ),
    SlopeThreshold(
        "conservative_plan",
        -15,
        15,
        "conservative_practice",
        "Консервативный порог реальных планов",
    ),
    SlopeThreshold(
        "speed_model_domain", -20, 20, "model_domain", "Область определения модели скорости ходьбы"
    ),
)

_FACTS: tuple[SlopeFact, ...] = (
    SlopeFact("nasa_no_numeric", NO_NASA_REQUIREMENT, "fact"),
    SlopeFact(
        "apollo_misjudged",
        "Экипаж Apollo оценил склон в 60 градусов, реально меньше 30: "
        "ошибка восприятия вдвое, низкое Солнце",
        "measurement",
    ),
    SlopeFact(
        "best_studied_slope",
        "Лучший изученный склон: модели рельефа дают от 11 до 22.5 градусов, неопределённость "
        "сопоставима с порогом, уклон показывать с допуском",
        "measurement",
    ),
    SlopeFact(
        "boxwork",
        "Boxwork: средний наклон ровера 8.63 градуса, максимум района 17.53, максимум миссии 29.12",
        "measurement",
    ),
    SlopeFact(
        "rover_time",
        "На склоне около 20 градусов ровер проходил половину плана, однажды пятую часть: "
        "уклон бьёт и по времени",
        "measurement",
    ),
    SlopeFact(
        "navigation_criterion",
        "Комбинированный критерий навигации марсохода: безопасно = уклон меньше 15 градусов "
        "и камни не больше 7% площади",
        "operational_rule",
    ),
)


def thresholds() -> list[SlopeThreshold]:
    return list(_THRESHOLDS)


def facts() -> list[SlopeFact]:
    return list(_FACTS)


def classify_slope(slope_deg: float) -> SlopeClass:
    a = abs(slope_deg)
    notes = [
        "Уклон по моделям рельефа имеет неопределённость, сопоставимую с порогами",
        NO_NASA_REQUIREMENT,
    ]
    if a < 15:
        level, label = "comfortable", "Ниже консервативного порога 15 градусов"
    elif a <= 20:
        level = "caution"
        label = "Выше консервативного порога, в пределах правила планировщика 20 градусов"
    elif a <= 25:
        level = "excluded_by_planner"
        label = (
            "Планировщик NASA исключает такой уклон; "
            "ориентир сообщества ещё допускает"
        )
    else:
        level, label = "extreme", "Круче ориентира сообщества 25 градусов"
    if a > 20:
        notes.append("Вне области определения модели скорости ходьбы")
    return SlopeClass(slope_deg, level, label, notes, PROVENANCE)
