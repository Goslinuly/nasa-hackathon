"""Тесты роутов EVA без сети: живые источники подменяются."""
import pytest
from fastapi.testclient import TestClient

from martian_map.api.main import create_app
from martian_map.modules.eva_sources import cache, gale_weather, rad_live, solar_events


@pytest.fixture()
def client() -> TestClient:
    cache.cache_clear()
    return TestClient(create_app())


def _patch_fetch(monkeypatch: pytest.MonkeyPatch, payloads: dict | Exception) -> None:
    async def fake(url: str, params: dict | None = None):
        if isinstance(payloads, Exception):
            raise payloads
        for suffix, payload in payloads.items():
            if url.endswith(suffix) or suffix in url:
                return payload
        raise RuntimeError(f"неожиданный URL {url}")

    monkeypatch.setattr(cache, "fetch_json", fake)


def test_mobility_profile_returns_corridors(client: TestClient) -> None:
    body = {
        "points": [
            {"distance_m": 0, "slope_deg": 0},
            {"distance_m": 1000, "slope_deg": 10},
            {"distance_m": 2000, "slope_deg": -5},
        ],
        "crew_kg": 80,
        "load_kg": 45,
        "surface": "sand",
    }
    response = client.post("/api/v1/eva/mobility-profile", json=body)
    assert response.status_code == 200
    data = response.json()
    assert len(data["segments"]) == 2
    for seg in data["segments"]:
        assert seg["power_w"]["low"] <= seg["power_w"]["high"]
        assert seg["o2_rate_lpm"]["low"] <= seg["o2_rate_lpm"]["high"]
        assert seg["speed_m_s"] > 0
    assert data["totals"]["time_s"] > 0
    assert data["totals"]["o2_l"]["low"] <= data["totals"]["o2_l"]["high"]


def test_walkback_accepts_near_and_rejects_far(client: TestClient) -> None:
    near = client.post(
        "/api/v1/eva/walkback",
        json={"points": [{"distance_from_base_m": 100}], "o2_remaining_l": 600},
    )
    far = client.post(
        "/api/v1/eva/walkback",
        json={"points": [{"distance_from_base_m": 500000}], "o2_remaining_l": 5},
    )
    assert near.status_code == 200 and far.status_code == 200
    assert near.text != far.text
    assert "true" in near.text.lower() or "false" in near.text.lower()


def test_radiation_pressure_correction_midpoint(client: TestClient) -> None:
    response = client.get("/api/v1/eva/radiation", params={"pressure_pa": 840})
    assert response.status_code == 200
    data = response.json()
    assert "dose_corridor" in data and "quality_factors" in data
    assert "220" in str(data["pressure_correction"])


def test_slopes_and_shielding(client: TestClient) -> None:
    assert client.get("/api/v1/eva/slopes").status_code == 200
    response = client.get("/api/v1/eva/shielding", params={"sky_view": 0.8})
    assert response.status_code == 200
    assert "shielded_dose" in response.json()


@pytest.mark.parametrize(
    "raw",
    [
        '{"points":[{"distance_m":1e12,"slope_deg":0}]}',
        '{"points":[{"distance_m":"nan","slope_deg":0}]}',
        '{"points":[]}',
    ],
)
def test_invalid_mobility_input_is_422(client: TestClient, raw: str) -> None:
    response = client.post(
        "/api/v1/eva/mobility-profile",
        content=raw,
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 422


def test_too_many_points_is_422(client: TestClient) -> None:
    points = [{"distance_m": float(i), "slope_deg": 0.0} for i in range(10000)]
    assert client.post("/api/v1/eva/mobility-profile", json={"points": points}).status_code == 422


def test_rad_live_unavailable_is_200(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_fetch(monkeypatch, ConnectionError("нет сети"))
    response = client.get("/api/v1/eva/rad-live", params={"days": 30})
    assert response.status_code == 200
    assert response.json()["status"] == "source_unavailable"


def test_rad_live_ok_converts_to_msv(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"parameters": [], "data": [["2026-01-01T00:00:00Z", 210.0], ["x", None]]}
    payload["data"] = payload["data"][:1]
    _patch_fetch(monkeypatch, {"/data": payload})
    data = client.get("/api/v1/eva/rad-live").json()
    assert data["status"] == "ok"
    assert data["count"] == 1
    assert data["quality_factor"] > 0
    assert data["series"][0]["dose_msv_per_sol"] > 0


def test_solar_events_carries_caveat(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_fetch(
        monkeypatch,
        {"/FLR": [{"peakTime": "2026-01-02T00:00Z", "classType": "M1.0", "link": "u"}],
         "/CMEAnalysis": [], "/SEP": []},
    )
    data = client.get("/api/v1/eva/solar-events").json()
    assert data["events"][0]["class"] == "M1.0"
    assert data["caveat"] == solar_events.CAVEAT


def test_conditions_latest_first(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    soles = [{"sol": "10", "min_temp": "-80", "max_temp": "-5", "pressure": "840"},
             {"sol": "11", "min_temp": "-79", "max_temp": "-4", "pressure": "841"}]
    _patch_fetch(monkeypatch, {"feed=weather": {"soles": soles}})
    data = client.get("/api/v1/eva/conditions").json()
    assert data["latest"]["sol"] == "11"
    assert data["latest"]["pressure_pa"] == 841.0
    assert data["caveat"] == gale_weather.CAVEAT


def test_conditions_unavailable_is_200(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_fetch(monkeypatch, {"feed=weather": {"oops": 1}})
    response = client.get("/api/v1/eva/conditions")
    assert response.status_code == 200
    assert response.json()["status"] == "source_unavailable"


def test_default_urls() -> None:
    assert rad_live.DEFAULT_URL == "https://iswa.gsfc.nasa.gov/IswaSystemWebApp/hapi"
