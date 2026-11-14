"""Публичные схемы ответа о покрытии. Кандидатное и опубликованное покрытие
показываются раздельно (ARCHITECTURE §10.2)."""

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
