# Роуты HTTP API.
from fastapi import APIRouter

from martian_map.api.routes.catalog import router as catalog_router
from martian_map.api.routes.coverage import router as coverage_router
from martian_map.api.routes.eva import router as eva_router
from martian_map.api.routes.health import router as health_router
from martian_map.api.routes.rovers import router as rovers_router
from martian_map.api.routes.science import router as science_router
from martian_map.api.routes.space_weather import router as space_weather_router

v1_router = APIRouter()
v1_router.include_router(health_router, tags=["service"])
v1_router.include_router(coverage_router, tags=["coverage"])
v1_router.include_router(catalog_router, tags=["catalog"])
v1_router.include_router(science_router, tags=["science"])
v1_router.include_router(rovers_router, tags=["rovers"])
v1_router.include_router(eva_router)
v1_router.include_router(space_weather_router, tags=["space-weather"])
