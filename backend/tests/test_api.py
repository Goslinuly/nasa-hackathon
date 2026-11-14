"""Тесты API без БД: health и валидация входа coverage."""

import httpx
import pytest

from martian_map.api.main import create_app


@pytest.fixture
def client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=create_app())
    return httpx.AsyncClient(transport=transport, base_url="http://test")


async def test_health(client: httpx.AsyncClient):
    async with client:
        response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_coverage_rejects_bad_latitude(client: httpx.AsyncClient):
    async with client:
        response = await client.get("/api/v1/coverage", params={"lat": 91, "lon": 10})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
