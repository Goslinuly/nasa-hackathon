"""Снимки роверов: разбор лент mars2020 и MSL, приоритет камер и честные отказы."""
import pytest
from fastapi.testclient import TestClient

from martian_map.api.main import create_app
from martian_map.modules.eva_sources import cache
from martian_map.modules.rovers import photos


@pytest.fixture()
def client() -> TestClient:
    cache.cache_clear()
    return TestClient(create_app())


M2020 = {
    "images": [
        {
            "sample_type": "Thumbnail",
            "camera": {"instrument": "NAVCAM_LEFT"},
            "image_files": {"medium": "https://x/thumb.jpg"},
            "sol": 1000,
        },
        {
            "sample_type": "Full",
            "camera": {"instrument": "SHERLOC_WATSON"},
            "image_files": {"medium": "https://x/watson.jpg"},
            "sol": 1000,
            "date_taken_utc": "2023-12-13T05:00:00",
        },
        {
            "sample_type": "Full",
            "camera": {"instrument": "NAVCAM_LEFT"},
            "image_files": {"medium": "https://x/nav.jpg"},
            "sol": 1000,
            "date_taken_utc": "2023-12-13T06:00:00",
        },
    ]
}
MSL = {
    "items": [
        {"instrument": "CHEMCAM_RMI", "url": "https://x/rmi.jpg", "sol": 3000},
        {"instrument": "MAST_LEFT", "url": "https://x/mast.jpg", "sol": 3000},
    ]
}


def _patch(monkeypatch: pytest.MonkeyPatch, payload: dict) -> None:
    async def fake(url: str, params: dict | None = None):
        return payload

    monkeypatch.setattr(cache, "fetch_json", fake)


def test_m2020_prefers_nav_and_skips_thumbnails() -> None:
    rows = photos.parse_m2020(M2020, 6)
    assert [r["url"] for r in rows] == ["https://x/nav.jpg", "https://x/watson.jpg"]


def test_msl_prefers_mast() -> None:
    rows = photos.parse_msl(MSL, 6)
    assert rows[0]["instrument"] == "MAST_LEFT"


def test_photos_route_ok(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, M2020)
    data = client.get("/api/v1/rovers/photos?rover=perseverance&sol=1000&limit=2").json()
    assert data["status"] == "ok"
    assert data["count"] == 2
    assert data["credit"] == "NASA/JPL-Caltech/ASU"
    assert "трека" in data["caveat"]


def test_photos_route_source_down(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fail(url: str, params: dict | None = None):
        raise RuntimeError("сеть")

    monkeypatch.setattr(cache, "fetch_json", fail)
    response = client.get("/api/v1/rovers/photos?rover=curiosity&sol=3000")
    assert response.status_code == 200
    assert response.json()["status"] == "source_unavailable"


def test_photos_route_validates_rover(client: TestClient) -> None:
    assert client.get("/api/v1/rovers/photos?rover=spirit&sol=1").status_code == 422
