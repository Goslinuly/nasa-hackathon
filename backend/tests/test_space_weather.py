"""Тесты прокси NASA DONKI без сети: ответы подменяются транспортом httpx."""

import httpx
import pytest

from martian_map.api.main import create_app
from martian_map.modules.space_weather import donki
from martian_map.modules.space_weather.donki import DonkiService, get_donki_service

SAMPLES = {
    "FLR": [{"beginTime": "2026-11-05T18:21Z", "peakTime": "2026-11-05T18:33Z",
             "classType": "M3.5", "sourceLocation": "S08E35",
             "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/FLR/49391/-1"}],
    "CME": [{"startTime": "2026-11-07T04:24Z", "sourceLocation": "",
             "cmeAnalyses": [{"isMostAccurate": False, "speed": 100.0},
                             {"isMostAccurate": True, "speed": 812.4, "halfAngle": 19.0}],
             "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/CME/49386/-1"}],
    "SEP": None,  # пустое тело, как DONKI иногда отвечает на пустой период
    "GST": [{"startTime": "2026-11-06T15:00Z",
             "allKpIndex": [{"kpIndex": 6.67}, {"kpIndex": 7.0}],
             "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/GST/49066/-1"}],
}


def make_transport(calls: list[str], fail: bool = False) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if fail:
            raise httpx.ConnectTimeout("нет связи", request=request)
        event_type = request.url.path.rsplit("/", 1)[-1]
        assert request.url.params["startDate"] < request.url.params["endDate"]
        body = SAMPLES[event_type]
        if body is None:
            return httpx.Response(200, content=b"")
        return httpx.Response(200, json=body)

    return httpx.MockTransport(handler)


async def request_events(service: DonkiService, **params) -> httpx.Response:
    app = create_app()
    app.dependency_overrides[get_donki_service] = lambda: service
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.get("/api/v1/space-weather/events", params=params)


async def test_events_are_normalized_and_sorted_newest_first():
    calls: list[str] = []
    response = await request_events(DonkiService(transport=make_transport(calls)), days=7)

    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "NASA DONKI"
    assert data["note"] == "DONKI описывает обстановку у Земли; приход к Марсу — оценка"
    assert data["fetched_utc"].endswith("Z")
    assert [e["type"] for e in data["events"]] == ["CME", "GST", "FLR"]
    assert [e["start_utc"] for e in data["events"]] == [
        "2026-11-07T04:24:00Z", "2026-11-06T15:00:00Z", "2026-11-05T18:21:00Z"]
    cme, gst, flr = data["events"]
    assert "812 км/с" in cme["summary"]
    assert "Kp до 7" in gst["summary"]
    assert "M3.5" in flr["summary"] and "18:33" in flr["summary"]
    assert flr["link"].startswith("https://ccmc.gsfc.nasa.gov/DONKI/view/FLR/")
    assert set(data["events"][0]) == {"type", "start_utc", "summary", "link"}
    assert sorted(c.rsplit("/", 1)[-1] for c in calls) == ["CME", "FLR", "GST", "SEP"]


async def test_second_request_is_served_from_cache():
    calls: list[str] = []
    service = DonkiService(transport=make_transport(calls))
    await request_events(service, days=3)
    await request_events(service, days=3)
    assert len(calls) == 4


async def test_upstream_failure_gives_503_in_project_format():
    response = await request_events(DonkiService(transport=make_transport([], fail=True)))
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "space_weather_unavailable"


async def test_upstream_error_status_gives_503():
    transport = httpx.MockTransport(lambda request: httpx.Response(500, text="oops"))
    response = await request_events(DonkiService(transport=transport))
    assert response.status_code == 503


async def test_stale_cache_is_used_when_upstream_fails(monkeypatch: pytest.MonkeyPatch):
    calls: list[str] = []
    service = DonkiService(transport=make_transport(calls))
    first = (await request_events(service)).json()
    monkeypatch.setattr(donki, "CACHE_TTL_S", 0)
    service._transport = make_transport(calls, fail=True)
    second = await request_events(service)
    assert second.status_code == 200
    assert second.json() == first


async def test_days_out_of_range_is_rejected():
    response = await request_events(DonkiService(transport=make_transport([])), days=90)
    assert response.status_code == 422
