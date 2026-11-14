"""Тесты правила возврата EVA: допустимость точек и монотонность дальности."""

import json

import pytest

from martian_map.modules.eva import walkback

RESERVE_L = walkback.o2_for_minutes(walkback.RESERVE_MIN)


def need_at(distance_m: float) -> float:
    return walkback.check_point(distance_m, 0.0).o2_need_l


def test_base_point_allowed_with_reserve_only() -> None:
    result = walkback.walkback_check([{"distance_from_base_m": 0}], RESERVE_L + 0.01)
    assert result.points[0].allowed
    assert result.points[0].t_return_min == 0
    assert result.points[0].o2_need_l == pytest.approx(RESERVE_L)


def test_exact_budget_allowed_slightly_less_is_not() -> None:
    need = need_at(3100)
    exact = walkback.walkback_check([{"distance_from_base_m": 3100}], need)
    assert exact.points[0].allowed
    assert exact.points[0].margin_l == pytest.approx(0.0)
    short = walkback.walkback_check([{"distance_from_base_m": 3100}], need - 0.01)
    assert not short.points[0].allowed
    assert short.farthest_allowed_m is None


def test_return_time_uses_3_3_kmh() -> None:
    point = walkback.check_point(3300, 100.0)
    assert point.t_return_min == pytest.approx(60.0)
    assert point.o2_need_l == pytest.approx(422 / 348.3 * 90)


def test_farthest_allowed_is_monotonic_in_oxygen() -> None:
    points = [{"distance_from_base_m": d} for d in (0, 500, 1000, 2000, 3100, 5000)]
    previous = -1.0
    for o2 in (30, 40, 60, 90, 120, 200, 400):
        farthest = walkback.walkback_check(points, float(o2)).farthest_allowed_m
        value = -1.0 if farthest is None else farthest
        assert value >= previous
        previous = value


def test_provenance_and_constants() -> None:
    result = walkback.walkback_check([{"distance_from_base_m": 100}], 100.0, elapsed_min=10)
    assert "двойной отказ не планируется" in result.provenance.note
    assert json.dumps(result.to_dict())
    assert walkback.APOLLO_ROVER_LIMIT_KM == 7.6
    assert walkback.APOLLO_WALK_LIMIT_KM == 3.1
