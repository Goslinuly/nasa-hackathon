"""Модели каталога: источники, продукты, версии, покрытие, районы и места."""

from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from martian_map.infrastructure.db import Base
from martian_map.modules.common.enums import FootprintKind, VerificationStatus
from martian_map.modules.coordinates import MARS_SRID


class Source(Base):
    __tablename__ = "source"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    organization: Mapped[str] = mapped_column(String(200))
    title: Mapped[str] = mapped_column(String(300))
    url: Mapped[str | None] = mapped_column(Text)
    doi: Mapped[str | None] = mapped_column(String(200))
    usage_terms_url: Mapped[str | None] = mapped_column(Text)
    credit: Mapped[str | None] = mapped_column(Text)
    accessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)

    assets: Mapped[list["Asset"]] = relationship(back_populates="source")


class Region(Base):
    __tablename__ = "region"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    name_ru: Mapped[str] = mapped_column(String(200))
    name_en: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    bounds: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="MULTIPOLYGON", srid=MARS_SRID), nullable=True
    )
    local_crs_wkt: Mapped[str | None] = mapped_column(Text)
    local_origin: Mapped[dict | None] = mapped_column(JSON)
    coverage_status: Mapped[str] = mapped_column(
        String(50), default=VerificationStatus.CANDIDATE.value
    )
    extra: Mapped[dict | None] = mapped_column(JSON)


class Asset(Base):
    __tablename__ = "asset"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("source.id"))
    region_id: Mapped[int | None] = mapped_column(ForeignKey("region.id"))
    kind: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(300))
    mission: Mapped[str | None] = mapped_column(String(100))
    instrument: Mapped[str | None] = mapped_column(String(100))

    source: Mapped[Source] = relationship(back_populates="assets")
    versions: Mapped[list["AssetVersion"]] = relationship(back_populates="asset")


class AssetVersion(Base):
    __tablename__ = "asset_version"
    __table_args__ = (
        UniqueConstraint(
            "asset_id", "product_id", "version_label", name="uq_asset_product_version"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("asset.id"))
    product_id: Mapped[str] = mapped_column(String(300), index=True)
    version_label: Mapped[str] = mapped_column(String(50), default="v1")
    url: Mapped[str | None] = mapped_column(Text)
    size_mb: Mapped[float | None] = mapped_column(Float)
    checksum_sha256: Mapped[str | None] = mapped_column(String(64))

    original_crs: Mapped[str | None] = mapped_column(Text)
    latitude_type: Mapped[str | None] = mapped_column(String(30))
    longitude_convention: Mapped[str | None] = mapped_column(String(30))
    vertical_datum: Mapped[str | None] = mapped_column(String(100))

    resolution_m: Mapped[float | None] = mapped_column(Float)
    coverage_area_km2: Mapped[float | None] = mapped_column(Float)
    nodata_fraction: Mapped[float | None] = mapped_column(Float)
    nodata_value: Mapped[float | None] = mapped_column(Float)
    height_min_m: Mapped[float | None] = mapped_column(Float)
    height_max_m: Mapped[float | None] = mapped_column(Float)
    registration_error_m: Mapped[float | None] = mapped_column(Float)
    ortho_count: Mapped[int | None] = mapped_column(Integer)

    license: Mapped[str | None] = mapped_column(String(100))
    credit: Mapped[str | None] = mapped_column(Text)
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    downloaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    verification_status: Mapped[str] = mapped_column(
        String(50), default=VerificationStatus.CANDIDATE.value, index=True
    )
    verification_notes: Mapped[str | None] = mapped_column(Text)
    extra: Mapped[dict | None] = mapped_column(JSON)

    asset: Mapped[Asset] = relationship(back_populates="versions")
    footprints: Mapped[list["CoverageFootprint"]] = relationship(back_populates="asset_version")


class CoverageFootprint(Base):
    __tablename__ = "coverage_footprint"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_version_id: Mapped[int] = mapped_column(ForeignKey("asset_version.id"))
    kind: Mapped[str] = mapped_column(String(30), default=FootprintKind.PRODUCT_EXTENT.value)
    geom: Mapped[object] = mapped_column(Geometry(geometry_type="MULTIPOLYGON", srid=MARS_SRID))
    area_km2: Mapped[float | None] = mapped_column(Float)
    derivation: Mapped[str | None] = mapped_column(Text)

    asset_version: Mapped[AssetVersion] = relationship(back_populates="footprints")


class RasterProduct(Base):
    __tablename__ = "raster_product"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_version_id: Mapped[int] = mapped_column(ForeignKey("asset_version.id"))
    region_id: Mapped[int | None] = mapped_column(ForeignKey("region.id"))
    kind: Mapped[str] = mapped_column(String(50))
    pixel_size_m: Mapped[float | None] = mapped_column(Float)
    nodata_value: Mapped[float | None] = mapped_column(Float)
    manifest: Mapped[dict | None] = mapped_column(JSON)
    object_key: Mapped[str | None] = mapped_column(Text)
    qa_status: Mapped[str] = mapped_column(String(50), default=VerificationStatus.CANDIDATE.value)
    processing_params: Mapped[dict | None] = mapped_column(JSON)


class Place(Base):
    __tablename__ = "place"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    name_ru: Mapped[str] = mapped_column(String(200))
    name_en: Mapped[str] = mapped_column(String(200))
    feature_type: Mapped[str | None] = mapped_column(String(100))
    position: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="POINT", srid=MARS_SRID), nullable=True
    )
    position_source_id: Mapped[int | None] = mapped_column(ForeignKey("source.id"))
    coordinate_uncertainty_m: Mapped[float | None] = mapped_column(Float)
    facts: Mapped[list | None] = mapped_column(JSON)
    image_url: Mapped[str | None] = mapped_column(Text)
    region_id: Mapped[int | None] = mapped_column(ForeignKey("region.id"))
