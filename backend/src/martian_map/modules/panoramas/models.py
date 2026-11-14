"""Панорамы: фиксированные точки съёмки с проверенной геометрией и hotspots.

Панорама не имитирует непрерывную наземную съёмку и не дорисовывает
недостающее небо: valid_image_bounds хранит фактический охват.
"""

from geoalchemy2 import Geometry
from sqlalchemy import JSON, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from martian_map.infrastructure.db import Base
from martian_map.modules.coordinates import MARS_SRID


class Panorama(Base):
    __tablename__ = "panorama"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("source.id"))
    region_id: Mapped[int | None] = mapped_column(ForeignKey("region.id"))
    title: Mapped[str] = mapped_column(String(300))
    mission: Mapped[str | None] = mapped_column(String(100))
    instrument: Mapped[str | None] = mapped_column(String(100))
    sol: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="POINT", srid=MARS_SRID), nullable=True
    )
    position_method: Mapped[str | None] = mapped_column(Text)  # телеметрия, ручная привязка...
    coordinate_uncertainty_m: Mapped[float | None] = mapped_column(Float)
    projection: Mapped[str | None] = mapped_column(String(100))
    yaw_offset_deg: Mapped[float | None] = mapped_column(Float)
    horizontal_fov_deg: Mapped[float | None] = mapped_column(Float)
    vertical_fov_deg: Mapped[float | None] = mapped_column(Float)
    valid_image_bounds: Mapped[dict | None] = mapped_column(JSON)
    object_key: Mapped[str | None] = mapped_column(Text)
    credit: Mapped[str | None] = mapped_column(Text)
    verification_status: Mapped[str] = mapped_column(String(50), default="candidate")


class PanoramaHotspot(Base):
    """Вручную проверенная связь направления взгляда с мишенью."""

    __tablename__ = "panorama_hotspot"

    id: Mapped[int] = mapped_column(primary_key=True)
    panorama_id: Mapped[int] = mapped_column(ForeignKey("panorama.id"))
    target_id: Mapped[int | None] = mapped_column(ForeignKey("target.id"))
    yaw_deg: Mapped[float] = mapped_column(Float)
    pitch_deg: Mapped[float] = mapped_column(Float)
    label: Mapped[str] = mapped_column(String(300))
    verified_by: Mapped[str | None] = mapped_column(String(100))
