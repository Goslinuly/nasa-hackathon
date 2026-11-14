"""Публичные схемы каталога (DTO отделены от SQLAlchemy-моделей)."""

from datetime import datetime

from pydantic import BaseModel


class RegionOut(BaseModel):
    slug: str
    name_ru: str
    name_en: str
    description: str | None = None
    coverage_status: str
    bounds_verified: bool


class ProductOut(BaseModel):
    product_id: str
    title: str
    kind: str
    mission: str | None = None
    instrument: str | None = None
    region_slug: str | None = None
    url: str | None = None
    size_mb: float | None = None
    resolution_m: float | None = None
    coverage_area_km2: float | None = None
    nodata_fraction: float | None = None
    nodata_value: float | None = None
    height_min_m: float | None = None
    height_max_m: float | None = None
    registration_error_m: float | None = None
    ortho_count: int | None = None
    license: str | None = None
    credit: str | None = None
    verification_status: str
    verification_notes: str | None = None
    registered_at: datetime | None = None
