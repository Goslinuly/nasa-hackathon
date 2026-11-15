"""Уровень данных точки: считается по продуктам сборки, а не по каталогу кандидатов."""

import json
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from martian_map.api.main import create_app
from martian_map.i18n import reset_lang, set_lang
from martian_map.infrastructure.db import get_session
from martian_map.modules.common.enums import DataLevel, VerificationStatus
from martian_map.modules.coverage.schemas import CoverageProduct
from martian_map.modules.coverage.served import (
    Bounds,
    global_products_at,
    load_served,
    package_at,
)
from martian_map.modules.coverage.service import resolve_data_level

REPO = Path(__file__).resolve().parents[2]
LOCAL_DIR = REPO / "frontend" / "public" / "data" / "local"

GALE = (-4.804, 137.3825)
MARINERIS = (-8.0, 290.0)


def overview(status: str) -> list[CoverageProduct]:
    return [CoverageProduct(title="MOLA", kind="global_dem", verification_status=status)]


def test_detailed_package_gives_local_dtm():
    package = package_at(*GALE)
    assert package is not None and package.slug == "gale-boxwork"
    level, explanation = resolve_data_level(package, overview(VerificationStatus.PUBLISHED.value))
    assert level == DataLevel.LOCAL_DTM
    assert "1 м/пикс" in explanation


def test_point_outside_packages_still_has_overview():
    assert package_at(*MARINERIS) is None
    products = global_products_at(*MARINERIS)
    assert [product.product_id for product in products] == [
        "MEGT90N000EB.IMG",
        "mola_hrsc_blend_slope_200m_8ppd",
        "tes_ti_putzig_day_8ppd",
    ]
    level, _ = resolve_data_level(None, [_as_coverage(product) for product in products])
    assert level == DataLevel.ORBITAL_OVERVIEW


def test_unassessed_only_without_published_products():
    level, explanation = resolve_data_level(None, [])
    assert level == DataLevel.UNASSESSED
    assert "кандидатные" in explanation
    level, _ = resolve_data_level(None, overview(VerificationStatus.METADATA_VERIFIED.value))
    assert level == DataLevel.UNASSESSED


def test_overview_covers_every_latitude():
    for lat in (-89.9, -45.0, 0.0, 45.0, 89.9):
        for lon in (0.0, 77.25, 180.0, 331.37, 359.9):
            assert global_products_at(lat, lon), f"нет обзорного продукта в {lat}, {lon}"


def test_bounds_cross_zero_meridian():
    bounds = Bounds(west=350, south=-10, east=10, north=10)
    assert bounds.contains(0, 5) and bounds.contains(0, 355)
    assert not bounds.contains(0, 180)
    assert not bounds.contains(20, 5)


def test_local_bounds_match_frontend_manifests():
    for package in load_served().packages:
        manifest = json.loads(
            (LOCAL_DIR / package.slug / "manifest.json").read_text(encoding="utf-8")
        )
        assert manifest["bounds_lonlat"] == {
            "west": package.bounds.west,
            "south": package.bounds.south,
            "east": package.bounds.east,
            "north": package.bounds.north,
        }, f"границы пакета {package.slug} разошлись с манифестом фронтенда"
        assert package.bounds.contains(
            manifest["center"]["lat"], manifest["center"]["lon_east"]
        )


def test_local_products_come_from_manifest_sources():
    for package in load_served().packages:
        manifest = json.loads(
            (LOCAL_DIR / package.slug / "manifest.json").read_text(encoding="utf-8")
        )
        known = {source["product"] for source in manifest.get("sources", [])}
        for product in package.products:
            assert product.product_id in known, (
                f"{product.product_id} нет в источниках манифеста {package.slug}"
            )


def test_served_files_exist_in_build():
    for product in load_served().global_products:
        if product.served_file:
            assert (REPO / product.served_file).exists(), f"нет файла {product.served_file}"


def test_published_products_carry_credit_and_resolution():
    served = load_served()
    products = [*served.global_products, *(p for pkg in served.packages for p in pkg.products)]
    for product in products:
        if product.published:
            assert product.credit, f"{product.product_id} без кредита"
            assert product.resolution_m, f"{product.product_id} без разрешения"


def test_explanation_follows_request_language():
    token = set_lang("en")
    try:
        _, explanation = resolve_data_level(package_at(*GALE), [])
    finally:
        reset_lang(token)
    assert "m/px" in explanation and "verified trail" in explanation


def test_endpoint_returns_package_for_a_detailed_point():
    """Полный ответ API: внутри пакета уровень локальный, снаружи — обзорный."""
    client = TestClient(create_app())

    async def session():
        yield EmptySession()

    client.app.dependency_overrides[get_session] = session
    inside = client.get("/api/v1/coverage", params={"lat": GALE[0], "lon": GALE[1]}).json()
    far = {"lat": MARINERIS[0], "lon": MARINERIS[1]}
    outside = client.get("/api/v1/coverage", params=far).json()

    assert inside["data_level"] == "local_dtm"
    assert inside["local_package"]["slug"] == "gale-boxwork"
    assert inside["local_package"]["walk_url"] == "#walk/gale-boxwork"
    assert [p["product_id"] for p in inside["published_local"]] == [
        "DTEEC_019698_1750_019988_1750_U01",
        "ESP_019698_1750_RED_A_01_ORTHO",
    ]
    assert outside["data_level"] == "orbital_overview"
    assert outside["local_package"] is None
    assert outside["published_local"] == []
    assert outside["published_overview"][0]["product_id"] == "MEGT90N000EB.IMG"


def test_endpoint_survives_a_dead_catalog():
    """База лежит — покрытие всё равно отвечает по продуктам сборки, а не 503."""
    client = TestClient(create_app())

    async def session():
        yield DeadSession()

    client.app.dependency_overrides[get_session] = session
    body = client.get("/api/v1/coverage", params={"lat": GALE[0], "lon": GALE[1]})

    assert body.status_code == 200
    answer = body.json()
    assert answer["data_level"] == "local_dtm"
    assert answer["local_package"]["slug"] == "gale-boxwork"
    assert answer["overview_candidates"] == [] and answer["local_candidates"] == []
    assert "Каталог кандидатов сейчас не отвечает" in answer["explanation"]


class EmptySession:
    """Каталог кандидатов пуст: проверяется только вклад продуктов сборки."""

    async def execute(self, statement):
        return _Rows([])


class DeadSession:
    """База данных не отвечает: драйвер роняет соединение на первом же запросе."""

    async def execute(self, statement):
        raise OperationalError("SELECT 1", {}, Exception("соединение разорвано"))


class _Rows:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


def _as_coverage(product) -> CoverageProduct:
    return CoverageProduct(
        title=product.title.ru,
        product_id=product.product_id,
        kind=product.kind,
        resolution_m=product.resolution_m,
        verification_status=product.verification_status,
    )
