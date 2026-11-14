"""Тесты скорости ходьбы, коэффициента грунта и метаболической мощности EVA."""

import json

import pytest

from martian_map.modules.eva import mobility

W, L, V = 80.0, 45.0, 0.75


def test_walk_speed_reference_points() -> None:
    assert mobility.walk_speed(0).speed_ms == pytest.approx(0.75)
    assert mobility.walk_speed(20).speed_ms == pytest.approx(0.55)
    assert mobility.walk_speed(-20).speed_ms == pytest.approx(0.95)
    assert mobility.walk_speed(10).status == "ok"


def test_walk_speed_outside_domain_is_flagged_and_clamped() -> None:
    result = mobility.walk_speed(25)
    assert result.status == "outside_model_domain"
    assert result.speed_ms == pytest.approx(0.55)


def test_terrain_factor() -> None:
    low, high = mobility.terrain_factor("sand", 0.75)
    assert low == high
    assert low == pytest.approx(3.81, abs=0.01)
    assert mobility.terrain_factor("firm", 0.75) == (1.0, 1.2)


def test_base_power_on_uphill_matches_hand_calculation() -> None:
    grade = 2.0
    expected = 0.38 * (
        1.5 * W
        + 2 * (W + L) * (L / W) ** 2
        + 1.0 * (W + L) * (1.5 * V**2 + 0.35 * V * grade)
    )
    assert mobility.metabolic_power(W, L, V, grade, 1.0, "nasa_tool") == pytest.approx(expected)


def test_flat_base_terms_match_hand_calculation() -> None:
    base = 1.5 * 80 + 2 * 125 * (45 / 80) ** 2 + 125 * (1.5 * 0.5625)
    correction = 1.0 * (0 - 125 * 36 / 80 + (25 - 0.5625))
    expected = 0.38 * (base - correction)
    assert mobility.metabolic_power(W, L, V, 0.0, 1.0, "nasa_tool") == pytest.approx(expected)


def test_downhill_correction_gives_finite_positive_below_uphill() -> None:
    down = mobility.metabolic_power(W, L, V, -10.0, 1.0, "nasa_tool")
    up = mobility.metabolic_power(W, L, V, 10.0, 1.0, "nasa_tool")
    assert 0 < down < up


def test_correction_not_applied_uphill() -> None:
    t1, t2, t3a, t3b, cf = mobility._terms(W, L, V, 5.0, 1.0)
    assert cf == 0.0


def test_inertial_mode_keeps_limb_term_unscaled() -> None:
    nasa = mobility.metabolic_power(W, L, V, 0.0, 1.0, "nasa_tool")
    inertial = mobility.metabolic_power(W, L, V, 0.0, 1.0, "inertial_kept")
    assert nasa < inertial
    t3a = 1.0 * (W + L) * 1.5 * V**2
    assert inertial - nasa == pytest.approx(t3a * (1 - 0.38))


def test_corridor_is_ordered_and_serializable() -> None:
    low, high = mobility.mars_power_corridor(W, L, V, 0.0, 1.0)
    assert low < high
    detail = mobility.mars_power_corridor_detail(W, L, V, 0.0, 1.0)
    assert detail.low_mode == "nasa_tool"
    assert json.dumps(detail.to_dict())


def test_unknown_gravity_mode_rejected() -> None:
    with pytest.raises(ValueError):
        mobility.metabolic_power(W, L, V, 0.0, 1.0, "earth")


def test_oxygen_rate() -> None:
    assert mobility.oxygen_rate_lpm(348.3) == pytest.approx(1.0)
