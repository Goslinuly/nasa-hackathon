"""Модели науки: слои, мишени и наблюдения с provenance."""

from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import JSON, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from martian_map.infrastructure.db import Base
from martian_map.modules.common.enums import EvidenceType
from martian_map.modules.coordinates import MARS_SRID


class ResearchStudy(Base):
    __tablename__ = "research_study"
    __table_args__ = (
        CheckConstraint("latitude_deg BETWEEN -90 AND 90", name="research_latitude"),
        CheckConstraint("longitude_deg >= 0 AND longitude_deg < 360", name="research_longitude"),
        CheckConstraint(
            "(latitude_deg IS NULL AND longitude_deg IS NULL) OR "
            "(latitude_deg IS NOT NULL AND longitude_deg IS NOT NULL "
            "AND position_evidence IS NOT NULL)", name="research_position_evidence"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    external_id: Mapped[str] = mapped_column(String(200), unique=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("source.id"))
    title: Mapped[str] = mapped_column(String(300))
    summary: Mapped[str] = mapped_column(Text)
    mission: Mapped[str | None] = mapped_column(String(100))
    instrument: Mapped[str | None] = mapped_column(String(100))
    source_url: Mapped[str | None] = mapped_column(Text)
    latitude_deg: Mapped[float | None] = mapped_column(Float)
    longitude_deg: Mapped[float | None] = mapped_column(Float)
    position_evidence: Mapped[str | None] = mapped_column(Text)
    position_uncertainty_m: Mapped[float | None] = mapped_column(Float)
    verification_status: Mapped[str] = mapped_column(String(50))
    metadata_json: Mapped[dict] = mapped_column(JSON)


class ResearchImportFile(Base):
    __tablename__ = "research_import_file"
    id: Mapped[int] = mapped_column(primary_key=True)
    import_key: Mapped[str] = mapped_column(String(64), unique=True)
    filename: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(50))
    reason: Mapped[str] = mapped_column(Text)
    study_id: Mapped[int | None] = mapped_column(ForeignKey("research_study.id"))


class Target(Base):
    __tablename__ = "target"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    region_id: Mapped[int | None] = mapped_column(ForeignKey("region.id"))
    geom: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="GEOMETRY", srid=MARS_SRID), nullable=True
    )
    geometry_uncertainty_m: Mapped[float | None] = mapped_column(Float)
    binding_level: Mapped[str | None] = mapped_column(
        String(50)
    )
    description: Mapped[str | None] = mapped_column(Text)


class Observation(Base):
    __tablename__ = "observation"

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int | None] = mapped_column(ForeignKey("research_study.id"), index=True)
    import_key: Mapped[str | None] = mapped_column(String(200), unique=True)
    target_id: Mapped[int | None] = mapped_column(ForeignKey("target.id"))
    source_id: Mapped[int] = mapped_column(ForeignKey("source.id"))
    mission: Mapped[str | None] = mapped_column(String(100))
    instrument: Mapped[str | None] = mapped_column(String(100))
    evidence_type: Mapped[str] = mapped_column(
        String(30), default=EvidenceType.MEASUREMENT.value
    )
    quantity: Mapped[str | None] = mapped_column(String(200))
    value_num: Mapped[float | None] = mapped_column(Float)
    value_text: Mapped[str | None] = mapped_column(Text)
    unit: Mapped[str | None] = mapped_column(String(50))
    observed_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sol: Mapped[int | None] = mapped_column(Integer)
    footprint: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="GEOMETRY", srid=MARS_SRID), nullable=True
    )
    quality: Mapped[str | None] = mapped_column(String(100))
    extra: Mapped[dict | None] = mapped_column(JSON)


class Layer(Base):
    __tablename__ = "layer"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    title: Mapped[str] = mapped_column(String(300))
    quantity: Mapped[str | None] = mapped_column(String(200))
    unit: Mapped[str | None] = mapped_column(String(50))
    render_type: Mapped[str | None] = mapped_column(String(50))
    spatial_coverage: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="MULTIPOLYGON", srid=MARS_SRID), nullable=True
    )
    time_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    time_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_m: Mapped[float | None] = mapped_column(Float)
    nodata_value: Mapped[float | None] = mapped_column(Float)
    source_ids: Mapped[list | None] = mapped_column(JSON)
    availability: Mapped[str | None] = mapped_column(
        String(50)
    )
