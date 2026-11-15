# Роут космической погоды: события NASA DONKI за последние дни.
import logging

from fastapi import APIRouter, Depends, Query

from martian_map.api.errors import ApiError
from martian_map.api.lang import LocalizedRoute
from martian_map.i18n import Text
from martian_map.modules.space_weather.donki import (
    DonkiService,
    DonkiUnavailable,
    get_donki_service,
)

logger = logging.getLogger(__name__)
router = APIRouter(route_class=LocalizedRoute)


@router.get("/space-weather/events")
async def space_weather_events(
    # DONKI принимает окно не больше 60 суток; берём с запасом.
    days: int = Query(default=7, ge=1, le=30),
    service: DonkiService = Depends(get_donki_service),
) -> dict:
    try:
        return await service.events(days)
    except DonkiUnavailable as exc:
        logger.warning("DONKI недоступен: %s", exc)
        raise ApiError(
            503,
            "space_weather_unavailable",
            Text(
                "Каталог солнечных событий NASA DONKI временно не отвечает. Попробуйте позже.",
                "The NASA DONKI solar event catalog is temporarily not responding. "
                "Please try again later.",
            ),
        ) from exc
