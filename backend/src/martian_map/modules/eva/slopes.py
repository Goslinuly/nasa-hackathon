"""Пороги уклона для пеших выходов: природа каждого порога, факты и классификация уклона."""

from dataclasses import dataclass

from martian_map.i18n import Text
from martian_map.modules.eva.provenance import ALGORITHM_VERSION, Provenance, to_plain

NO_NASA_REQUIREMENT = Text(
    "Численного требования к уклону в стандарте NASA по здоровью экипажа нет "
    "(проверен полный текст); "
    "ссылаться на требование NASA 20 градусов нельзя",
    "The NASA crew health standard has no numeric slope requirement "
    "(full text checked); "
    "do not cite a NASA 20-degree requirement",
)

PROVENANCE = Provenance(
    source=Text(
        "Эксплуатационные правила и ориентиры сообщества, не стандарт здоровья экипажа",
        "Operational rules and community guidelines, not a crew health standard",
    ),
    status="operational_rule",
    units=Text("градусы", "degrees"),
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
        Text(
            "Действующее эксплуатационное правило инструмента планирования NASA: "
            "круче исключается",
            "Current operational rule of the NASA planning tool: anything steeper is excluded",
        ),
    ),
    SlopeThreshold(
        "community_walkable", -25, 25, "community_guideline",
        Text("Ориентир сообщества: доступно пешком", "Community guideline: walkable"),
    ),
    SlopeThreshold(
        "conservative_plan",
        -15,
        15,
        "conservative_practice",
        Text("Консервативный порог реальных планов", "Conservative threshold of real plans"),
    ),
    SlopeThreshold(
        "speed_model_domain", -20, 20, "model_domain",
        Text(
            "Область определения модели скорости ходьбы",
            "Valid domain of the walking speed model",
        ),
    ),
)

_FACTS: tuple[SlopeFact, ...] = (
    SlopeFact("nasa_no_numeric", NO_NASA_REQUIREMENT, "fact"),
    SlopeFact(
        "apollo_misjudged",
        Text(
            "Экипаж Apollo оценил склон в 60 градусов, реально меньше 30: "
            "ошибка восприятия вдвое, низкое Солнце",
            "An Apollo crew judged a slope at 60 degrees when it was under 30: "
            "a twofold perception error under a low Sun",
        ),
        "measurement",
    ),
    SlopeFact(
        "best_studied_slope",
        Text(
            "Лучший изученный склон: модели рельефа дают от 11 до 22.5 градусов, "
            "неопределённость сопоставима с порогом, уклон показывать с допуском",
            "The best-studied slope: terrain models give 11 to 22.5 degrees, an uncertainty "
            "comparable to the threshold, so show slope with a tolerance",
        ),
        "measurement",
    ),
    SlopeFact(
        "boxwork",
        Text(
            "Boxwork: средний наклон ровера 8.63 градуса, максимум района 17.53, "
            "максимум миссии 29.12",
            "Boxwork: mean rover tilt 8.63 degrees, area maximum 17.53, mission maximum 29.12",
        ),
        "measurement",
    ),
    SlopeFact(
        "rover_time",
        Text(
            "На склоне около 20 градусов ровер проходил половину плана, однажды пятую часть: "
            "уклон бьёт и по времени",
            "On a slope of about 20 degrees the rover covered half of the plan, once a fifth: "
            "slope costs time as well",
        ),
        "measurement",
    ),
    SlopeFact(
        "navigation_criterion",
        Text(
            "Комбинированный критерий навигации марсохода: безопасно = уклон меньше 15 градусов "
            "и камни не больше 7% площади",
            "Combined rover navigation criterion: safe = slope under 15 degrees "
            "and rocks covering no more than 7% of the area",
        ),
        "operational_rule",
    ),
)

SLOPE_UNCERTAINTY_NOTE = Text(
    "Уклон по моделям рельефа имеет неопределённость, сопоставимую с порогами",
    "Slope from terrain models has an uncertainty comparable to the thresholds",
)
OUTSIDE_SPEED_DOMAIN_NOTE = Text(
    "Вне области определения модели скорости ходьбы",
    "Outside the valid domain of the walking speed model",
)
LABEL_COMFORTABLE = Text(
    "Ниже консервативного порога 15 градусов", "Below the conservative 15-degree threshold"
)
LABEL_CAUTION = Text(
    "Выше консервативного порога, в пределах правила планировщика 20 градусов",
    "Above the conservative threshold, within the 20-degree planner rule",
)
LABEL_EXCLUDED = Text(
    "Планировщик NASA исключает такой уклон; "
    "ориентир сообщества ещё допускает",
    "The NASA planner excludes this slope; "
    "the community guideline still allows it",
)
LABEL_EXTREME = Text(
    "Круче ориентира сообщества 25 градусов", "Steeper than the 25-degree community guideline"
)


def thresholds() -> list[SlopeThreshold]:
    return list(_THRESHOLDS)


def facts() -> list[SlopeFact]:
    return list(_FACTS)


def classify_slope(slope_deg: float) -> SlopeClass:
    a = abs(slope_deg)
    notes: list[str] = [SLOPE_UNCERTAINTY_NOTE, NO_NASA_REQUIREMENT]
    if a < 15:
        level, label = "comfortable", LABEL_COMFORTABLE
    elif a <= 20:
        level, label = "caution", LABEL_CAUTION
    elif a <= 25:
        level, label = "excluded_by_planner", LABEL_EXCLUDED
    else:
        level, label = "extreme", LABEL_EXTREME
    if a > 20:
        notes.append(OUTSIDE_SPEED_DOMAIN_NOTE)
    return SlopeClass(slope_deg, level, label, notes, PROVENANCE)
