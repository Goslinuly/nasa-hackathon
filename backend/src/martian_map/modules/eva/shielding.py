"""Экранирование рельефом: доля открытой дозы под видимой частью неба с учётом альбедо грунта."""

from dataclasses import dataclass

from martian_map.i18n import Text
from martian_map.modules.eva.provenance import ALGORITHM_VERSION, Provenance, to_plain

DEFAULT_ALBEDO_SHARE = (0.18, 0.24)
DEFAULT_ANGULAR_EXPONENT = 2.0

PROVENANCE = Provenance(
    source=Text(
        "Линейное взвешивание по доле неба: доля = (1 - a)*sky^(n/2) + a, "
        "a - вклад отражённого грунтом",
        "Linear weighting by sky fraction: fraction = (1 - a)*sky^(n/2) + a, "
        "a - the ground-reflected contribution",
    ),
    status="model",
    units=Text(
        "доля открытой дозы; доза в единицах входа",
        "fraction of the open-sky dose; dose in input units",
    ),
    note=Text(
        "Показатель углового распределения n уточняется по первоисточнику; "
        "нужен локальный DTM, в приложении пока подключён не везде",
        "The angular distribution exponent n is still being checked against the primary "
        "source; a local DTM is needed, and the app does not have one everywhere yet",
    ),
)
VALIDATION_PROVENANCE = Provenance(
    source=Text(
        "Шесть точек в кратере Гейл: измеренное снижение дозы рельефом",
        "Six points in Gale crater: measured dose reduction by terrain",
    ),
    status="measurement",
    units=Text("процент снижения", "percent reduction"),
)

VALIDATION_FACTS: tuple[dict[str, object], ...] = (
    {
        "key": "gale_points",
        "count": 6,
        "reduction_pct_range": (2, 19),
        "label": Text(
            "Шесть точек в кратере Гейл: снижение от 2% (пологие формы) "
            "до 19% (узкая долина под утёсом)",
            "Six points in Gale crater: reduction from 2% (gentle landforms) "
            "to 19% (a narrow valley below a cliff)",
        ),
    },
    {
        "key": "ground_albedo",
        "share_range": (0.18, 0.24),
        "label": Text(
            "Отражённый грунтом вклад 18-24% полной дозы, "
            "поэтому реальное снижение всегда меньше наивного",
            "Ground-reflected radiation is 18-24% of the total dose, "
            "so the real reduction is always smaller than the naive one",
        ),
    },
)


@dataclass(frozen=True)
class ShieldedDose:
    open_dose: float
    sky_view_fraction: float
    angular_exponent: float
    albedo_share: tuple[float, float]
    dose_low: float
    dose_high: float
    reduction_low: float
    reduction_high: float
    status: str
    provenance: Provenance
    version: str = ALGORITHM_VERSION

    def to_dict(self) -> dict[str, object]:
        return to_plain(self)


@dataclass(frozen=True)
class ValidationFacts:
    facts: list[dict[str, object]]
    provenance: Provenance

    def to_dict(self) -> dict[str, object]:
        return to_plain(self)


def shielded_dose(
    open_dose: float,
    sky_view_fraction: float,
    angular_exponent: float = DEFAULT_ANGULAR_EXPONENT,
    albedo_share: tuple[float, float] = DEFAULT_ALBEDO_SHARE,
) -> ShieldedDose:
    if not 0.0 <= sky_view_fraction <= 1.0:
        raise ValueError("sky_view_fraction must be within [0, 1]")
    weight = sky_view_fraction ** (angular_exponent / 2)
    fractions = [(1 - a) * weight + a for a in albedo_share]
    doses = [open_dose * f for f in fractions]
    reductions = [1 - f for f in fractions]
    return ShieldedDose(
        open_dose,
        sky_view_fraction,
        angular_exponent,
        (min(albedo_share), max(albedo_share)),
        min(doses),
        max(doses),
        min(reductions),
        max(reductions),
        "model",
        PROVENANCE,
    )


def validation_facts() -> ValidationFacts:
    return ValidationFacts(list(VALIDATION_FACTS), VALIDATION_PROVENANCE)
