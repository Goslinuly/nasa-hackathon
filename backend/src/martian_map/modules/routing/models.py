"""Модели маршрутов: пользовательский план и сегменты с уровнем данных."""

from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from martian_map.infrastructure.db import Base
from martian_map.modules.common.enums import DataLevel, JobStatus
from martian_map.modules.coordinates import MARS_SRID


class RoutePlan(Base):
    __tablename__ = "route_plan"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    status: Mapped[str] = mapped_column(String(30), default=JobStatus.QUEUED.value, index=True)
    start: Mapped[dict] = mapped_column(JSON)
    destination: Mapped[dict] = mapped_column(JSON)
    waypoints: Mapped[list | None] = mapped_column(JSON)
    estimate_parameters: Mapped[dict | None] = mapped_column(JSON)
    science_goals: Mapped[list | None] = mapped_column(JSON)
    algorithm_version: Mapped[str | None] = mapped_column(String(50))
    publication_id: Mapped[int | None] = mapped_column(ForeignKey("publication.id"))
    idempotency_key: Mapped[str | None] = mapped_column(String(100), unique=True)
    error: Mapped[str | None] = mapped_column(Text)
    owner_token: Mapped[str | None] = mapped_column(String(100), index=True)

    segments: Mapped[list["RouteSegment"]] = relationship(
        back_populates="plan", order_by="RouteSegment.seq"
    )


class RouteSegment(Base):
    __tablename__ = "route_segment"

    id: Mapped[int] = mapped_column(primary_key=True)
    route_plan_id: Mapped[int] = mapped_column(ForeignKey("route_plan.id"))
    seq: Mapped[int] = mapped_column(Integer)
    geom: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="LINESTRING", srid=MARS_SRID), nullable=True
    )
    data_level: Mapped[str] = mapped_column(String(30), default=DataLevel.UNASSESSED.value)
    resolution_m: Mapped[float | None] = mapped_column(Float)
    length_m: Mapped[float | None] = mapped_column(Float)
    length_is_estimate: Mapped[bool] = mapped_column(default=True)
    source_asset_version_ids: Mapped[list | None] = mapped_column(JSON)
    degradation_reason: Mapped[str | None] = mapped_column(Text)
    extra: Mapped[dict | None] = mapped_column(JSON)

    plan: Mapped[RoutePlan] = relationship(back_populates="segments")
