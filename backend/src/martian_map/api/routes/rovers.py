# Роут снимков роверов: лента NASA по солу, отказы источника не превращаются в 500.
from fastapi import APIRouter, Query

from martian_map.api.lang import LocalizedRoute
from martian_map.modules.rovers import photos, positions

router = APIRouter(route_class=LocalizedRoute, prefix="/rovers")


@router.get("/positions")
async def rover_positions() -> dict:
    return await positions.fetch_positions()


@router.get("/photos")
async def rover_photos(
    rover: str = Query(pattern="^(perseverance|curiosity)$"),
    sol: int = Query(ge=0, le=10000),
    limit: int = Query(default=6, ge=1, le=12),
) -> dict:
    return await photos.fetch_photos(rover, sol, limit)
