# Роуты научных данных и поиска исследований вдоль маршрута.
import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from martian_map.api.errors import ApiError
from martian_map.api.lang import LocalizedRoute
from martian_map.config import get_settings
from martian_map.i18n import Text
from martian_map.infrastructure.db import get_session
from martian_map.modules.science.models import Observation, ResearchStudy
from martian_map.modules.science.rad import RadObservation, analyze_rad
from martian_map.modules.science.research import ResearchRouteInput, find_research, study_card

router = APIRouter(route_class=LocalizedRoute)

RESEARCH_DB_UNAVAILABLE = Text(
    "База исследований недоступна", "The research database is unavailable"
)
SCIENCE_DATA_MISSING = Text("Научный набор не установлен", "The science dataset is not installed")


def error_text(exc: Exception) -> str:
    """Текст исключения; пара Text сохраняется (str() оставил бы только русский)."""
    if exc.args and isinstance(exc.args[0], Text):
        return exc.args[0]
    return str(exc)


def paired(item: dict, key: str) -> dict:
    """Поле key становится парой Text с key_en из того же файла данных."""
    ru, en = item.get(key), item.get(f"{key}_en")
    if isinstance(ru, str) and isinstance(en, str):
        return {**item, key: Text(ru, en)}
    if isinstance(ru, list) and isinstance(en, list) and len(ru) == len(en):
        return {**item, key: [Text(r, e) for r, e in zip(ru, en, strict=True)]}
    return item


@router.get("/science/research")
async def research_catalog(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
) -> dict:
    try:
        studies = (
            await session.scalars(
                select(ResearchStudy).order_by(ResearchStudy.id).offset(offset).limit(limit)
            )
        ).all()
        total = await session.scalar(select(func.count()).select_from(ResearchStudy))
        count = await session.scalar(
            select(func.count()).select_from(Observation).where(Observation.study_id.is_not(None))
        )
        return {
            "total": total,
            "measurement_count": count,
            "studies": [study_card(s) for s in studies],
        }
    except (SQLAlchemyError, OSError) as exc:
        raise ApiError(
            503, "research_database_unavailable", RESEARCH_DB_UNAVAILABLE
        ) from exc


@router.post("/science/research/along-route")
async def research_along_route(
    query: ResearchRouteInput,
    session: AsyncSession = Depends(get_session),
) -> dict:
    try:
        return await find_research(session, query)
    except ValueError as exc:
        raise ApiError(422, "invalid_research_route", error_text(exc)) from exc
    except (SQLAlchemyError, OSError) as exc:
        raise ApiError(
            503, "research_database_unavailable", RESEARCH_DB_UNAVAILABLE
        ) from exc


def read_data(filename: str) -> dict:
    path = Path(get_settings().science_data_dir) / filename
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ApiError(503, "science_data_unavailable", SCIENCE_DATA_MISSING) from exc


@router.get("/science/intake")
def intake() -> dict:
    data = read_data("intake.json")
    return {**data, "sources": [paired(source, "reason") for source in data.get("sources", [])]}


@router.get("/science/rad")
def rad_analysis(
    start: datetime | None = None,
    end: datetime | None = None,
    include_flagged: bool = False,
) -> dict:
    dataset = read_data("rad.json")
    rows = [RadObservation.model_validate(row) for row in dataset["observations"]]
    try:
        analysis = analyze_rad(rows, start, end, include_flagged)
    except ValueError as exc:
        raise ApiError(422, "invalid_analysis_interval", error_text(exc)) from exc
    metadata = {
        key: value
        for key, value in dataset.items()
        if key not in ("observations", "derived_source_formulas")
    }
    return {"dataset": paired(metadata, "limitations"), "analysis": analysis}
