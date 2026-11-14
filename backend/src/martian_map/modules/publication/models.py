"""Публикация и импорт: переключение активного manifest и журнал заданий."""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from martian_map.infrastructure.db import Base
from martian_map.modules.common.enums import JobStatus


class Publication(Base):
    __tablename__ = "publication"

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(100), unique=True)
    manifest: Mapped[dict] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    published_by: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)


class IngestJob(Base):
    __tablename__ = "ingest_job"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_version_id: Mapped[int | None] = mapped_column(ForeignKey("asset_version.id"))
    kind: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(30), default=JobStatus.QUEUED.value, index=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(200), unique=True)
    operator: Mapped[str | None] = mapped_column(String(100))
    log: Mapped[list | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
