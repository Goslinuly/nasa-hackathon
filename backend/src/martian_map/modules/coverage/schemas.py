"""Публичные схемы ответа о покрытии: кандидатное и опубликованное раздельно."""

from pydantic import BaseModel, Field

from martian_map.modules.common.enums import DataLevel
from martian_map.modules.coordinates import MarsPoint


class CoverageProduct(BaseModel):
    title: str
    product_id: str | None = None
    kind: str
    resolution_m: float | None = None
    registration_error_m: float | None = None
    verification_status: str
    license: str | None = None
    credit: str | None = None
    note: str | None = Field(
        default=None, description="Чем продукт полезен в точке и чего по нему сказать нельзя"
    )


class ServedPackageOut(BaseModel):
    """Подробный пакет участка, который приложение отдаёт в прогулку."""

    slug: str
    title: str
    walk_url: str | None = None
    best_dtm_resolution_m: float | None = None
    hirise_fraction: float | None = Field(
        default=None, description="Доля площади с исходным HiRISE, если пакет собран из двух DTM"
    )
    note: str | None = None
    bounds: list[float] = Field(
        default=[], description="Границы участка: запад, юг, восток, север; долготы восточные"
    )


class RegionCoverageCandidate(BaseModel):
    slug: str
    name_ru: str
    name_en: str
    dtm_count: int = 0
    best_dtm_resolution_m: float | None = None
    footprints_verified: bool = False
    verification_status: str
    note: str | None = None


class CoverageResponse(BaseModel):
    point: MarsPoint
    data_level: DataLevel = Field(
        description="Фактически подтверждённый уровень данных в точке"
    )
    explanation: str
    overview_candidates: list[CoverageProduct] = []
    published_overview: list[CoverageProduct] = []
    local_candidates: list[RegionCoverageCandidate] = Field(
        default=[],
        description=(
            "Районы с зарегистрированными DTM-кандидатами. Footprints не проверены — "
            "принадлежность точки району не утверждается."
        ),
    )
    published_local: list[CoverageProduct] = []
    local_package: ServedPackageOut | None = Field(
        default=None,
        description="Подробный пакет, в границы которого попала точка; иначе null",
    )
