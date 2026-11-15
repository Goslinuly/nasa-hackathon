# Точка входа FastAPI-приложения: сборка роутов и обработчиков ошибок.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from martian_map.api.errors import register_error_handlers
from martian_map.api.lang import LanguageMiddleware, LocalizedJSONResponse
from martian_map.api.routes import v1_router
from martian_map.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Martian Map API",
        version="0.1.0",
        description=(
            "Каталог марсианских геоданных, оценка покрытия и планирование экспедиций. "
            "Координаты: Mars, planetocentric latitude, восточная долгота [0, 360). "
            "Язык текстов: ?lang=ru|en или Accept-Language, по умолчанию русский. "
            "Mars geodata catalog, coverage assessment and EVA planning. "
            "Coordinates: Mars, planetocentric latitude, east longitude [0, 360). "
            "Text language: ?lang=ru|en or Accept-Language; Russian by default."
        ),
        openapi_url="/api/v1/openapi.json",
        docs_url="/api/v1/docs",
        default_response_class=LocalizedJSONResponse,
    )
    # Язык выбирается до роутов и обработчиков ошибок: они читают его из контекста запроса.
    app.add_middleware(LanguageMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    app.include_router(v1_router, prefix="/api/v1")
    return app


app = create_app()
