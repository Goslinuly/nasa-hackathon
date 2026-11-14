"""Отказ базы данных должен объясняться, а не приходить как голый 500.

Регрессия: /coverage и /regions отвечали «Internal Server Error», и в
интерфейсе это выглядело как необъяснимая поломка. Отказ соединения
приходит от asyncpg как ConnectionRefusedError и SQLAlchemy его не
оборачивает, поэтому одного SQLAlchemyError в обработчике мало.
"""

import httpx
import pytest
from fastapi import APIRouter
from sqlalchemy.exc import OperationalError

from martian_map.api.errors import register_error_handlers

pytestmark = pytest.mark.anyio

FAILURES = {
    "sqlalchemy": OperationalError("SELECT 1", {}, Exception("соединение разорвано")),
    "asyncpg_refused": ConnectionRefusedError("соединение отклонено"),
}


@pytest.fixture(params=sorted(FAILURES))
def failing_app(request):
    """Приложение, у которого маршрут падает так же, как при лежащей БД."""
    from fastapi import FastAPI

    app = FastAPI()
    router = APIRouter()

    @router.get("/boom")
    async def boom() -> dict:
        raise FAILURES[request.param]

    register_error_handlers(app)
    app.include_router(router, prefix="/api/v1")
    return app


async def test_database_failure_is_explained_not_a_bare_500(failing_app):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=failing_app), base_url="http://test"
    ) as client:
        response = await client.get("/api/v1/boom")

    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "database_unavailable"
    # Сообщение уходит пользователю в интерфейс — оно должно быть осмысленным.
    assert "База данных недоступна" in error["message"]
