"""Проверки поставляемого каталога исследований: валидность и поиск коридором."""

import json
from pathlib import Path

import pytest

from martian_map.modules.coordinates.types import MarsPoint
from martian_map.modules.science.research import (
    ResearchInput,
    nearest_on_route,
    prepare_route,
    route_offset,
)

CATALOG = Path(__file__).resolve().parents[1] / "data" / "science" / "research_catalog.json"


@pytest.fixture(scope="module")
def records() -> list[ResearchInput]:
    return [
        ResearchInput.model_validate(item)
        for item in json.loads(CATALOG.read_text(encoding="utf-8"))
    ]


def test_every_record_is_usable(records: list[ResearchInput]) -> None:
    assert records, "каталог пуст — поиск по маршруту ничего не найдёт"
    assert len({r.external_id for r in records}) == len(records)
    for record in records:
        assert record.point is not None
        assert record.position_evidence
        assert record.verification_status == "team_supplied_unverified"
        assert record.position_uncertainty_m >= 5000


def _distance_to_route(record: ResearchInput, *corners: tuple[float, float]) -> float:
    segments, _, _ = prepare_route(
        [MarsPoint(latitude_deg=lat, longitude_deg=lon) for lat, lon in corners]
    )
    return nearest_on_route(record.point, segments)[0]


def test_route_through_gale_finds_curiosity(records: list[ResearchInput]) -> None:
    curiosity = next(r for r in records if r.external_id == "landing-curiosity")
    distance = _distance_to_route(curiosity, (-4.59, 135.0), (-4.59, 140.0))
    assert distance < 5_000


def test_route_over_olympus_mons_finds_volcano_study(records: list[ResearchInput]) -> None:
    olympus = next(r for r in records if r.external_id == "olympus-hrsc-young-activity")
    assert _distance_to_route(olympus, (18.65, 226.2), (18.65, 230.0)) < 5_000


def _offset(record: ResearchInput, *corners: tuple[float, float]):
    segments, _, _ = prepare_route(
        [MarsPoint(latitude_deg=lat, longitude_deg=lon) for lat, lon in corners]
    )
    return route_offset(record.point, segments)


def test_side_follows_the_direction_of_travel(records: list[ResearchInput]) -> None:
    curiosity = next(r for r in records if r.external_id == "landing-curiosity")
    assert _offset(curiosity, (0.0, 135.0), (0.0, 140.0)).side == "right"
    assert _offset(curiosity, (0.0, 140.0), (0.0, 135.0)).side == "left"


def test_empty_corridor_still_knows_what_lies_around(records: list[ResearchInput]) -> None:
    corridor_m = 5_000
    route = ((-55.0, 30.0), (-55.0, 33.0))
    offsets = sorted(
        ((_offset(record, *route), record) for record in records),
        key=lambda pair: pair[0].distance_m,
    )
    assert all(offset.distance_m > corridor_m for offset, _ in offsets)

    nearest, _ = offsets[0]
    assert nearest.side in ("left", "right")
    assert nearest.distance_m > 1_000_000
