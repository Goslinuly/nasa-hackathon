"""Единый формат ошибок API: стабильный код и человекочитаемое объяснение."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    async def handle_backing_service_error(_: Request, exc: Exception) -> JSONResponse:
        logger.error("Отказ внешнего сервиса при обработке запроса", exc_info=exc)
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "database_unavailable",
                    "message": "База данных недоступна. Каталог и покрытие временно не отвечают.",
                }
            },
        )

    for failure in (SQLAlchemyError, OSError):
        app.add_exception_handler(failure, handle_backing_service_error)

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "Некорректные параметры запроса",
                    "details": [
                        {key: value for key, value in item.items() if key in ("loc", "msg", "type")}
                        for item in exc.errors()
                    ],
                }
            },
        )
