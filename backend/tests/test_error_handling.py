"""Тесты обработки отказа базы данных: понятный ответ вместо голого 500."""

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
    assert "База данных недоступна" in error["message"]
