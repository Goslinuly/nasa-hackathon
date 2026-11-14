"""Сводка космической погоды и доза за выход: шкалы SWPC и уровни советника без сети."""
import pytest
from fastapi.testclient import TestClient

from martian_map.api.main import create_app
from martian_map.api.routes import eva as eva_routes
from martian_map.modules.eva_sources import cache, swpc


@pytest.fixture()
def client() -> TestClient:
    cache.cache_clear()
    return TestClient(create_app())


def _patch_fetch(monkeypatch: pytest.MonkeyPatch, payloads: dict) -> None:
    async def fake(url: str, params: dict | None = None):
        for suffix, payload in payloads.items():
            if suffix in url:
                return payload
        raise RuntimeError(f"неожиданный URL {url}")

    monkeypatch.setattr(cache, "fetch_json", fake)


class _FakeDonki:
    async def events(self, days: int) -> dict:
        return {"source": "DONKI", "events": [{"type": "FLR"}] * 8}


def _swpc_payloads(flux_pfu: float) -> dict:
    return {
        "integral-protons-1-day.json": [
            {"energy": ">=10 MeV", "flux": 0.5, "time_tag": "2026-11-14T09:00Z"},
            {"energy": ">=100 MeV", "flux": 900.0, "time_tag": "2026-11-14T10:00Z"},
            {"energy": ">=10 MeV", "flux": flux_pfu, "time_tag": "2026-11-14T10:00Z"},
        ],
        "xrays-1-day.json": [
            {"energy": "0.05-0.4nm", "flux": 3e-4, "time_tag": "2026-11-14T10:00Z"},
            {"energy": "0.1-0.8nm", "flux": 5e-5, "time_tag": "2026-11-14T10:00Z"},
        ],
        "noaa-scales.json": {"0": {"R": {"Scale": "1"}, "S": {"Scale": "0"}, "G": {"Scale": None}}},
    }


def _rad_payload(latest: float) -> dict:
    data = [[f"2026-10-{day:02d}T00:00:00Z", 230.0] for day in range(1, 30)]
    data.append(["2026-11-13T00:00:00Z", latest])
    return {"data": data}


def test_s_scale_thresholds() -> None:
    assert [swpc.s_scale_of(v) for v in (9.9, 10, 1e2, 99999, 1e5)] == [0, 1, 2, 4, 5]


def test_xray_class_letters() -> None:
    assert swpc.xray_class_of(5e-5) == "M5.0"
    assert swpc.xray_class_of(2e-4) == "X2.0"
    assert swpc.xray_class_of(5e-9) == "A<1.0"
    assert swpc.xray_class_of(0.0) == "—"
    assert swpc.xray_class_of(float("nan")) == "—"


def test_series_picks_requested_channel() -> None:
    rows = _swpc_payloads(42.0)["integral-protons-1-day.json"]
    latest, peak, time_tag = swpc._series_latest_and_max(rows, ">=10 MeV")
    assert (latest, peak) == (42.0, 42.0)
    assert time_tag == "2026-11-14T10:00Z"


def test_space_weather_calm(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_fetch(monkeypatch, {**_swpc_payloads(0.8), "hapi": _rad_payload(231.0)})
    monkeypatch.setattr(eva_routes, "get_donki_service", lambda: _FakeDonki())
    data = client.get("/api/v1/eva/space-weather").json()
    assert data["advisory"]["level"] == "calm"
    assert data["mars_measured"]["status"] == "ok"
    assert data["earth_measured"]["s_scale_max24h"] == 0
    assert data["earth_measured"]["xray_class"] == "M5.0"
    assert data["earth_measured"]["noaa_scales_now"]["R"] == "1"
    assert len(data["events"]["events"]) == 6


def test_space_weather_elevated_by_mars_rad(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_fetch(monkeypatch, {**_swpc_payloads(50.0), "hapi": _rad_payload(400.0)})
    monkeypatch.setattr(eva_routes, "get_donki_service", lambda: _FakeDonki())
    data = client.get("/api/v1/eva/space-weather").json()
    assert data["advisory"]["level"] == "elevated"
    assert data["mars_measured"]["ratio_to_median"] > eva_routes.ADVISORY_RAD_RATIO
    assert data["earth_measured"]["s_scale_max24h"] == 1
    assert len(data["advisory"]["reasons"]) == 2


def test_space_weather_event_at_earth_only(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_fetch(monkeypatch, {**_swpc_payloads(1500.0), "hapi": _rad_payload(230.0)})
    monkeypatch.setattr(eva_routes, "get_donki_service", lambda: _FakeDonki())
    data = client.get("/api/v1/eva/space-weather").json()
    assert data["advisory"]["level"] == "event_at_earth"
    assert data["earth_measured"]["s_scale_max24h"] == 3


def test_space_weather_sources_down_is_200(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fail(url: str, params: dict | None = None):
        raise RuntimeError("сеть недоступна")

    monkeypatch.setattr(cache, "fetch_json", fail)
    response = client.get("/api/v1/eva/space-weather")
    assert response.status_code == 200
    data = response.json()
    assert data["mars_measured"]["status"] == "source_unavailable"
    assert data["earth_measured"]["status"] == "source_unavailable"
    assert data["advisory"]["level"] == "calm"


def test_route_dose_scales_with_time(client: TestClient) -> None:
    sol = client.post("/api/v1/eva/route-dose", json={"seconds": eva_routes.SOL_SECONDS}).json()
    half = client.post(
        "/api/v1/eva/route-dose", json={"seconds": eva_routes.SOL_SECONDS / 2}
    ).json()
    assert sol["dose_msv"]["mid"] == pytest.approx(sol["rate_corridor"]["mid"])
    assert half["dose_msv"]["mid"] == pytest.approx(sol["dose_msv"]["mid"] / 2)
    assert sol["dose_msv"]["low"] <= sol["dose_msv"]["mid"] <= sol["dose_msv"]["high"]


def test_route_dose_elevation_shifts_dose(client: TestClient) -> None:
    base = {"seconds": 3600.0}
    flat = client.post("/api/v1/eva/route-dose", json=base).json()
    down = client.post("/api/v1/eva/route-dose", json={**base, "delta_h_m": -4000}).json()
    up = client.post("/api/v1/eva/route-dose", json={**base, "delta_h_m": 4000}).json()
    assert up["dose_msv"]["mid"] > flat["dose_msv"]["mid"] > down["dose_msv"]["mid"]
    assert up["elevation_correction"] is not None


def test_route_dose_rejects_bad_time(client: TestClient) -> None:
    too_long = client.post(
        "/api/v1/eva/route-dose", json={"seconds": 3 * eva_routes.SOL_SECONDS}
    )
    assert too_long.status_code == 422
    assert client.post("/api/v1/eva/route-dose", json={"seconds": 0}).status_code == 422
