# Роуты каталога: районы с зарегистрированными продуктами.
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from martian_map.api.lang import LocalizedRoute
from martian_map.infrastructure.db import get_session
from martian_map.modules.catalog.schemas import ProductOut, RegionOut
from martian_map.modules.catalog.service import list_products, list_regions

router = APIRouter(route_class=LocalizedRoute)


@router.get("/regions", response_model=list[RegionOut])
async def get_regions(session: AsyncSession = Depends(get_session)) -> list[RegionOut]:
    return await list_regions(session)


@router.get("/products", response_model=list[ProductOut])
async def get_products(
    region: str | None = Query(default=None, description="slug района"),
    kind: str | None = Query(default=None, description="dtm | ortho | global_dem | global_mosaic"),
    session: AsyncSession = Depends(get_session),
) -> list[ProductOut]:
    return await list_products(session, region_slug=region, kind=kind)
