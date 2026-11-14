# Роут снимков роверов: лента NASA по солу, отказы источника не превращаются в 500.
from fastapi import APIRouter, Query

from martian_map.modules.rovers import photos

router = APIRouter(prefix="/rovers")


@router.get("/photos")
async def rover_photos(
    rover: str = Query(pattern="^(perseverance|curiosity)$"),
    sol: int = Query(ge=0, le=10000),
    limit: int = Query(default=6, ge=1, le=12),
) -> dict:
    return await photos.fetch_photos(rover, sol, limit)
