# Роут покрытия: какие данные доступны для координаты.
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from martian_map.infrastructure.db import get_session
from martian_map.modules.coordinates import MarsPoint
from martian_map.modules.coverage.schemas import CoverageResponse
from martian_map.modules.coverage.service import assess_point_coverage

router = APIRouter()


@router.get("/coverage", response_model=CoverageResponse)
async def get_coverage(
    lat: float = Query(ge=-90, le=90, description="Planetocentric latitude, градусы"),
    lon: float = Query(description="Восточная долгота; принимается и ±180, и 0–360"),
    session: AsyncSession = Depends(get_session),
) -> CoverageResponse:
    point = MarsPoint(latitude_deg=lat, longitude_deg=lon)
    return await assess_point_coverage(session, point)
