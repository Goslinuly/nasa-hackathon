"""Тесты маршрутов и геометрии поиска исследований вдоль трассы."""
import json
import math
import os
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from martian_map.api.main import create_app
from martian_map.infrastructure.db import get_session
from martian_map.modules import all_models  # noqa: F401
from martian_map.modules.coordinates.types import MARS_MEAN_RADIUS_M, MarsPoint
from martian_map.modules.science.models import Observation, ResearchImportFile, ResearchStudy
from martian_map.modules.science.research import (
    ResearchInput,
    ResearchRouteInput,
    find_research,
    nearest_on_route,
    prepare_route,
)
from martian_map.modules.science.research_import import import_rad_database, import_research_catalog


def point(lat, lon):
    return MarsPoint(latitude_deg=lat, longitude_deg=lon)


def test_equatorial_corridor_distance_and_order():
    segments, length, _ = prepare_route([point(0, 0), point(0, 2)])
    assert length == pytest.approx(math.radians(2) * MARS_MEAN_RADIUS_M)
    distance, along = nearest_on_route(point(0.001, 1), segments)
    assert distance == pytest.approx(math.radians(0.001) * MARS_MEAN_RADIUS_M)
    assert along == pytest.approx(length / 2)
    distance, along = nearest_on_route(point(0, 3), segments)
    assert distance == pytest.approx(length / 2)
    assert along == pytest.approx(length)


def test_seam_poles_waypoints_and_identical_endpoints():
    segments, length, _ = prepare_route([point(0, 359), point(0, 1)])
    assert nearest_on_route(point(0, 0), segments)[0] < 1e-6
    assert length < 120000
    segments, _, _ = prepare_route([point(89, 0), point(89, 180)])
    assert nearest_on_route(point(90, 40), segments)[0] < 1e-6
    segments, _, _ = prepare_route([point(0, 0), point(1, 0), point(1, 1)])
    assert nearest_on_route(point(1, 0.5), segments)[0] < 3
    segments, length, coordinates = prepare_route([point(0, 0), point(0, 0)])
    assert length == 0
    assert len(coordinates) >= 2
    assert nearest_on_route(point(0, 0), segments) == (0, 0)


def test_ambiguous_antipodal_path_and_unproven_coordinates():
    with pytest.raises(ValueError, match="промежуточную"):
        prepare_route([point(0, 0), point(0, 180)])
    with pytest.raises(ValidationError):
        point(0, float("nan"))
    with pytest.raises(ValidationError):
        ResearchInput(
            external_id="test",
            title="test",
            summary="test",
            source_url="https://example.org/data",
            point=point(0, 0),
        )


class FakeSession:
    def __init__(self, studies):
        self.studies = studies

    async def stream_scalars(self, statement):
        async def records():
            for study in self.studies:
                if study.latitude_deg is not None:
                    yield study

        return records()

    async def scalar(self, statement):
        return sum(s.latitude_deg is None for s in self.studies)


def study(id, lat, lon):
    return ResearchStudy(
        id=id,
        external_id=f"test-{id}",
        source_id=1,
        title="Synthetic test fixture",
        summary="Not imported into app data",
        latitude_deg=lat,
        longitude_deg=lon,
        verification_status="team_supplied_unverified",
        metadata_json={},
    )


async def test_route_filter_order_limit_and_missing_coordinates():
    session = FakeSession(
        [study(1, 0, 1.5), study(2, 0, 0.5), study(3, None, None), study(4, 2, 1)]
    )
    result = await find_research(
        session, ResearchRouteInput(points=[point(0, 0), point(0, 2)], corridor_m=500, limit=1)
    )
    assert result["matched_total"] == 2
    assert result["studies"][0]["id"] == 2
    assert result["truncated"] is True
    assert result["unlocated_studies"] == 1


async def test_route_api_contract_and_validation():
    app = create_app()

    async def session():
        yield FakeSession([study(1, 0, 1), study(2, None, None)])

    app.dependency_overrides[get_session] = session
    payload = {"points": [point(0, 0).model_dump(), point(0, 2).model_dump()], "corridor_m": 500}
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/api/v1/science/research/along-route", json=payload)
        assert response.status_code == 200
        assert response.json()["studies"][0]["id"] == 1
        assert response.json()["unlocated_studies"] == 1
        payload["corridor_m"] = -1
        assert (
            await client.post("/api/v1/science/research/along-route", json=payload)
        ).status_code == 422
        payload["corridor_m"] = 500
        payload["points"][1] = point(0, 180).model_dump()
        assert (
            await client.post("/api/v1/science/research/along-route", json=payload)
        ).status_code == 422


@pytest.mark.skipif(
    not os.getenv("MARTIAN_TEST_DATABASE_URL"),
    reason="Set MARTIAN_TEST_DATABASE_URL to a migrated PostgreSQL database",
)
async def test_postgres_import_idempotency_and_route_query():
    engine = create_async_engine(os.environ["MARTIAN_TEST_DATABASE_URL"])
    directory = Path(__file__).resolve().parents[1] / "data" / "science"
    dataset = json.loads((directory / "rad.json").read_text(encoding="utf-8"))
    intake = json.loads((directory / "intake.json").read_text(encoding="utf-8"))
    async with AsyncSession(engine) as session:
        try:
            await import_rad_database(session, dataset, intake)
            count = await session.scalar(select(func.count()).select_from(Observation))
            file_count = await session.scalar(select(func.count()).select_from(ResearchImportFile))
            await import_rad_database(session, dataset, intake)
            assert await session.scalar(select(func.count()).select_from(Observation)) == count
            assert (
                await session.scalar(select(func.count()).select_from(ResearchImportFile))
                == file_count
            )
            fixture = ResearchInput(
                external_id=f"TEST-ROLLBACK-{uuid4()}",
                title="Synthetic integration fixture",
                summary="Rolled back after test",
                source_url="https://example.org/test",
                point=point(0, 1),
                position_evidence="Synthetic test coordinate, never retained",
            )
            await import_research_catalog(session, [fixture])
            result = await find_research(
                session, ResearchRouteInput(points=[point(0, 0), point(0, 2)], corridor_m=500)
            )
            assert fixture.external_id in [s["external_id"] for s in result["studies"]]
        finally:
            await session.rollback()
    await engine.dispose()
