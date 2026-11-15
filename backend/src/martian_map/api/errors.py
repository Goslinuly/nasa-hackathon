"""Единый формат ошибок API: стабильный код и человекочитаемое объяснение.

Сообщение может быть парой Text(ru, en): язык выбирается по запросу (см. api/lang.py).
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError

from martian_map.api.lang import LocalizedJSONResponse
from martian_map.i18n import Text

logger = logging.getLogger(__name__)

DATABASE_UNAVAILABLE = Text(
    "База данных недоступна. Каталог и покрытие временно не отвечают.",
    "The database is unavailable. Catalog and coverage are temporarily not responding.",
)
INVALID_PARAMETERS = Text("Некорректные параметры запроса", "Invalid request parameters")

# Русские тексты собственных валидаторов внутри msg ошибок Pydantic (остальные msg — английские).
VALIDATION_MESSAGES_EN = {
    "Долгота должна быть конечным числом": "Longitude must be a finite number",
    "height_m требует указания vertical_datum": "height_m requires vertical_datum",
}


def _validation_msg(msg: object) -> object:
    if not isinstance(msg, str):
        return msg
    for ru, en in VALIDATION_MESSAGES_EN.items():
        if ru in msg:
            return Text(msg, msg.replace(ru, en))
    return msg


def _validation_detail(item: dict) -> dict:
    detail = {key: value for key, value in item.items() if key in ("loc", "type")}
    if "msg" in item:
        detail["msg"] = _validation_msg(item["msg"])
    return {key: detail[key] for key in ("loc", "msg", "type") if key in detail}


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(_: Request, exc: ApiError) -> LocalizedJSONResponse:
        return LocalizedJSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    async def handle_backing_service_error(_: Request, exc: Exception) -> LocalizedJSONResponse:
        logger.error("Отказ внешнего сервиса при обработке запроса", exc_info=exc)
        return LocalizedJSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "database_unavailable",
                    "message": DATABASE_UNAVAILABLE,
                }
            },
        )

    for failure in (SQLAlchemyError, OSError):
        app.add_exception_handler(failure, handle_backing_service_error)

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_: Request, exc: RequestValidationError) -> LocalizedJSONResponse:
        return LocalizedJSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": INVALID_PARAMETERS,
                    "details": [_validation_detail(item) for item in exc.errors()],
                }
            },
        )
