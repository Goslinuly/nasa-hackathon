"""Язык ответа: ?lang= или Accept-Language, по умолчанию русский; без сети и БД."""

import copy
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from martian_map.api.main import create_app
from martian_map.i18n import Text, localize, negotiate, parse_accept_language
from martian_map.infrastructure.db import get_session
from martian_map.modules.eva_sources import cache
from martian_map.modules.science.models import ResearchStudy
from martian_map.modules.space_weather.donki import DonkiService, get_donki_service

from .test_space_weather import make_transport

EN = {"lang": "en"}
EN_HEADER = {"Accept-Language": "en-US,en;q=0.9,ru;q=0.5"}


def has_cyrillic(value: object) -> bool:
    if isinstance(value, str):
        return any("а" <= ch.lower() <= "я" or ch in "ёЁ" for ch in value)
    if isinstance(value, dict):
        return any(has_cyrillic(v) for v in value.values())
    if isinstance(value, list):
        return any(has_cyrillic(v) for v in value)
    return False


@pytest.fixture()
def client() -> TestClient:
    cache.cache_clear()
    return TestClient(create_app())


# --- выбор языка ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("query", "header", "expected"),
    [
        (None, None, "ru"),
        ("en", None, "en"),
        ("EN", "ru", "en"),
        ("ru", "en", "ru"),
        ("de", "en-GB", "en"),
        (None, "en-US,en;q=0.9", "en"),
        (None, "ru-RU,ru;q=0.9,en;q=0.8", "ru"),
        (None, "de-DE,en;q=0.7,ru;q=0.3", "en"),
        (None, "en;q=0.2,ru;q=0.8", "ru"),
        (None, "de, fr", "ru"),
        (None, "en;q=0", "ru"),
    ],
)
def test_negotiation(query, header, expected) -> None:
    assert negotiate(query, header) == expected


def test_accept_language_without_known_tags() -> None:
    assert parse_accept_language("*") is None
    assert parse_accept_language("") is None


def test_text_is_russian_str_until_localized() -> None:
    text = Text("Слои", "Layers")
    assert text == "Слои"
    assert copy.deepcopy(text).en == "Layers"
    assert localize({"a": [text, ("x", text)]}, "en") == {"a": ["Layers", ["x", "Layers"]]}
    assert type(localize(text, "ru")) is str


def test_headers_mark_language_and_vary(client: TestClient) -> None:
    ru = client.get("/api/v1/eva/slopes")
    en = client.get("/api/v1/eva/slopes", params=EN)
    assert ru.headers["content-language"] == "ru"
    assert en.headers["content-language"] == "en"
    assert "Accept-Language" in en.headers["vary"]


# --- EVA ------------------------------------------------------------------------------------


def test_eva_slopes_english_by_query_and_header(client: TestClient) -> None:
    ru = client.get("/api/v1/eva/slopes").json()
    assert ru["facts"][0]["text"].startswith("Численного требования")
    for response in (
        client.get("/api/v1/eva/slopes", params=EN),
        client.get("/api/v1/eva/slopes", headers=EN_HEADER),
    ):
        body = response.json()
        assert not has_cyrillic(body), body
        assert body["facts"][0]["text"].startswith("The NASA crew health standard")
        assert body["thresholds"][1]["label"] == "Community guideline: walkable"


def test_eva_computed_routes_have_no_russian_in_english(client: TestClient) -> None:
    profile = client.post(
        "/api/v1/eva/mobility-profile",
        params=EN,
        json={
            "points": [{"distance_m": 0, "slope_deg": 0}, {"distance_m": 500, "slope_deg": 22}],
            "surface": "sand",
        },
    ).json()
    walk = client.post(
        "/api/v1/eva/walkback",
        params=EN,
        json={"points": [{"distance_from_base_m": 1000}], "o2_remaining_l": 300},
    ).json()
    rad = client.get("/api/v1/eva/radiation", params={**EN, "pressure_pa": 800, "delta_h_m": 100})
    shield = client.get("/api/v1/eva/shielding", params={**EN, "sky_view": 0.5}).json()
    dose = client.post("/api/v1/eva/route-dose", params=EN, json={"seconds": 3600}).json()
    for body in (profile, walk, rad.json(), shield, dose):
        assert not has_cyrillic(body), body
    assert profile["segments"][0]["slope_class"]["label"].startswith("The NASA planner excludes")
    assert dose["dose_msv"]["units"] == "mSv per EVA"
    assert rad.json()["dose_corridor"]["units"] == "mSv/sol"


def test_eva_unavailable_sources_explained_in_english(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def down(url: str, params: dict | None = None):
        raise httpx.ConnectError("нет связи")

    monkeypatch.setattr(cache, "fetch_json", down)
    rad = client.get("/api/v1/eva/rad-live", params=EN).json()
    events = client.get("/api/v1/eva/solar-events", params=EN).json()
    weather = client.get("/api/v1/eva/conditions", params=EN).json()
    for body in (rad, events, weather):
        assert body["status"] == "source_unavailable"
        assert "unavailable" in body["detail"]
        assert not has_cyrillic(body)
    # кэш не хранит язык: русский запрос после английского остаётся русским
    assert "недоступен" in client.get("/api/v1/eva/rad-live").json()["detail"]


# --- космическая погода ---------------------------------------------------------------------


def test_eva_space_weather_advisory_in_english(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from martian_map.api.routes import eva as eva_routes

    from .test_eva_space_weather import _FakeDonki, _patch_fetch, _rad_payload, _swpc_payloads

    _patch_fetch(monkeypatch, {**_swpc_payloads(50.0), "hapi": _rad_payload(400.0)})
    monkeypatch.setattr(eva_routes, "get_donki_service", lambda: _FakeDonki())
    en = client.get("/api/v1/eva/space-weather", params=EN).json()
    ru = client.get("/api/v1/eva/space-weather").json()
    assert en["advisory"]["level"] == ru["advisory"]["level"] == "elevated"
    assert not has_cyrillic(en), en
    assert en["advisory"]["reasons"][0].startswith("RAD background on Mars is 1.74 times")
    assert en["advisory"]["reasons"][1].startswith("S1 radiation storm at Earth")
    assert ru["advisory"]["reasons"][0].startswith("фон RAD на Марсе в 1.74 раза")


def donki_app(service: DonkiService):
    app = create_app()
    app.dependency_overrides[get_donki_service] = lambda: service
    return app


async def test_space_weather_events_in_english_and_russian_from_one_cache():
    calls: list[str] = []
    service = DonkiService(transport=make_transport(calls))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=donki_app(service)), base_url="http://test"
    ) as http:
        en = (await http.get("/api/v1/space-weather/events", params=EN)).json()
        ru = (await http.get("/api/v1/space-weather/events")).json()
        header = (await http.get("/api/v1/space-weather/events", headers=EN_HEADER)).json()
    assert len(calls) == 4, "второй и третий запросы — из кэша"
    assert not has_cyrillic(en)
    assert header == en
    assert en["note"] == "DONKI describes conditions near Earth; arrival at Mars is an estimate"
    cme, gst, flr = en["events"]
    assert cme["summary"] == "Coronal mass ejection, speed 812 km/s, half-angle 19°"
    assert gst["summary"] == "Geomagnetic storm at Earth, Kp up to 7"
    assert flr["summary"] == "Class M3.5 solar flare, region S08E35, peak 18:33 UTC"
    assert "812 км/с" in ru["events"][0]["summary"]


async def test_space_weather_error_in_english():
    service = DonkiService(transport=make_transport([], fail=True))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=donki_app(service)), base_url="http://test"
    ) as http:
        en = await http.get("/api/v1/space-weather/events", headers=EN_HEADER)
        ru = await http.get("/api/v1/space-weather/events")
    assert en.status_code == ru.status_code == 503
    assert en.json()["error"]["code"] == "space_weather_unavailable"
    assert en.json()["error"]["message"].startswith("The NASA DONKI solar event catalog")
    assert ru.json()["error"]["message"].startswith("Каталог солнечных событий")


# --- ошибки ---------------------------------------------------------------------------------


def test_validation_error_in_english(client: TestClient) -> None:
    en = client.get("/api/v1/coverage", params={"lat": 91, "lon": 10, **EN})
    ru = client.get("/api/v1/coverage", params={"lat": 91, "lon": 10})
    assert en.status_code == ru.status_code == 422
    assert en.json()["error"]["message"] == "Invalid request parameters"
    assert ru.json()["error"]["message"] == "Некорректные параметры запроса"


def test_coordinate_validator_message_in_english(client: TestClient) -> None:
    body = {"points": [{"latitude_deg": 0, "longitude_deg": "nan"}] * 2, "corridor_m": 500}
    response = client.post("/api/v1/science/research/along-route", params=EN, json=body)
    assert response.status_code == 422
    assert not has_cyrillic(response.json())


# --- покрытие, каталог, наука ---------------------------------------------------------------


class Rows:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class CoverageSession:
    """Первый запрос — обзорные продукты, второй — районы с DTM."""

    def __init__(self):
        self.calls = 0

    async def execute(self, statement):
        self.calls += 1
        if self.calls % 2 == 1:
            asset = SimpleNamespace(title="MGS MOLA DEM 463 м/пикс", kind="global_dem")
            version = SimpleNamespace(
                product_id="mars_mgs_mola_dem_463m",
                resolution_m=463,
                registration_error_m=None,
                verification_status="metadata_verified",
                license=None,
                credit="NASA/USGS",
            )
            return Rows([(version, asset)])
        region = SimpleNamespace(
            slug="jezero",
            name_ru="Кратер Езеро",
            name_en="Jezero Crater",
            bounds=None,
            coverage_status="candidate",
        )
        return Rows([(region, 4, 1.01)])


def test_coverage_in_english(client: TestClient) -> None:
    async def session():
        yield CoverageSession()

    client.app.dependency_overrides[get_session] = session
    en = client.get("/api/v1/coverage", params={"lat": 18.4, "lon": 77.5, **EN}).json()
    ru = client.get("/api/v1/coverage", params={"lat": 18.4, "lon": 77.5}).json()
    assert en["explanation"].startswith("There is no published data for this point")
    assert en["local_candidates"][0]["note"].startswith("Footprints and valid-data masks")
    assert en["overview_candidates"][0]["title"] == "MGS MOLA DEM 463 m/px"
    assert en["local_candidates"][0]["name_ru"] == "Кратер Езеро"  # имя на обоих языках
    assert not has_cyrillic({k: v for k, v in en.items() if k != "local_candidates"})
    assert ru["explanation"].startswith("Опубликованных данных для этой точки нет")
    assert ru["overview_candidates"][0]["title"] == "MGS MOLA DEM 463 м/пикс"


class ResearchSession:
    def __init__(self, studies):
        self.studies = studies

    async def scalars(self, statement):
        return Rows(self.studies)

    async def scalar(self, statement):
        return len(self.studies)


def research_study(id: int, external_id: str, title: str, summary: str) -> ResearchStudy:
    return ResearchStudy(
        id=id,
        external_id=external_id,
        source_id=1,
        title=title,
        summary=summary,
        latitude_deg=None,
        longitude_deg=None,
        verification_status="team_supplied_unverified",
        metadata_json={},
    )


def test_research_catalog_in_english(client: TestClient) -> None:
    studies = [
        research_study(
            1,
            "landing-viking-1",
            "Viking 1 — равнина Хриса",
            "Первый успешно работавший посадочный аппарат NASA на Марсе: съёмка поверхности, "
            "метеорология и поиск признаков жизни.",
        ),
        research_study(
            2,
            "rad-acf565348545c690",
            "MSL RAD: архивные измерения, sol 3290",
            "87 наблюдений, каналы B и E. Требуется привязка координат "
            "из первичного продукта; это не отдельные места исследования.",
        ),
    ]

    async def session():
        yield ResearchSession(studies)

    client.app.dependency_overrides[get_session] = session
    en = client.get("/api/v1/science/research", headers=EN_HEADER).json()
    ru = client.get("/api/v1/science/research").json()
    viking, rad = en["studies"]
    assert viking["title"] == "Viking 1 — Chryse Planitia"
    assert viking["title_en"] == "Viking 1 — Chryse Planitia"
    assert rad["title"] == "MSL RAD: archival measurements, sol 3290"
    assert rad["summary"].startswith("87 observations, channels B and E.")
    assert not has_cyrillic(en)
    assert ru["studies"][0]["title"] == "Viking 1 — равнина Хриса"
    assert ru["studies"][0]["title_en"] == "Viking 1 — Chryse Planitia"


def test_science_files_in_english(client: TestClient) -> None:
    intake = client.get("/api/v1/science/intake", params=EN).json()
    rad = client.get("/api/v1/science/rad", params=EN).json()
    assert not has_cyrillic(intake)
    assert not has_cyrillic(rad["dataset"])
    assert rad["dataset"]["limitations"][2].startswith("These are historical measurements")
    ru = client.get("/api/v1/science/rad").json()
    assert ru["dataset"]["limitations"][2].startswith("Это исторические измерения")
    assert ru["analysis"] == rad["analysis"], "числа не зависят от языка"


def test_research_catalog_file_has_english_for_every_text() -> None:
    from martian_map.modules.catalog.translations import registry_english
    from martian_map.modules.science.translations import catalog_english

    research = catalog_english()
    assert len(research) == 15
    expected = {"title", "summary", "position_evidence"}
    assert all(set(fields) == expected for fields in research.values())
    assert all(not has_cyrillic(en) for fields in research.values() for en in fields.values())
    registry = registry_english()
    assert all(not has_cyrillic(en) for en in registry.values())
    assert len(registry) >= 12
