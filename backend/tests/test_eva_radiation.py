"""Тесты радиации, уклонов и экранирования рельефом режима EVA."""

import json

import pytest

from martian_map.modules.eva import radiation, shielding, slopes


def test_dose_corridor_is_ordered() -> None:
    corridor = radiation.dose_corridor()
    assert corridor.low < corridor.mid < corridor.high
    assert (corridor.range_low, corridor.range_high) == (0.25, 0.95)
    assert json.dumps(corridor.to_dict())


def test_quality_factors_have_one_default() -> None:
    variants = radiation.quality_factors()
    assert [v.default for v in variants].count(True) == 1
    assert json.dumps([v.to_dict() for v in variants])


def test_convert_ugy_to_msv() -> None:
    assert radiation.convert_ugy_to_msv(220, 3.05).msv == pytest.approx(0.671)
    assert radiation.convert_ugy_to_msv(220).msv == pytest.approx(0.671)


def test_pressure_correction_base_and_status() -> None:
    base = radiation.pressure_correction(840)
    assert (base.low, base.mid, base.high) == (220, 220, 220)
    assert base.status == "empirical"
    higher = radiation.pressure_correction(940)
    assert higher.low < higher.mid < higher.high < 220
    assert radiation.pressure_correction(300).status == "extrapolated"
    assert radiation.pressure_correction(1500).status == "extrapolated"


def test_elevation_correction() -> None:
    measured = radiation.elevation_correction(150)
    assert measured.delta_ugy_per_sol == pytest.approx(6.0)
    assert measured.status == "measured"
    assert radiation.elevation_correction(500).status == "measured"
    assert radiation.elevation_correction(800).status == "estimated"
    assert radiation.elevation_correction(-100).delta_ugy_per_sol == pytest.approx(-4.0)


def test_slope_thresholds_state_nature_and_no_nasa_requirement() -> None:
    assert all(t.nature for t in slopes.thresholds())
    assert any("нет" in f.text and "NASA" in f.text for f in slopes.facts())
    assert "нет" in slopes.classify_slope(10).provenance.note


def test_classify_slope_levels() -> None:
    assert slopes.classify_slope(10).level == "comfortable"
    assert slopes.classify_slope(-18).level == "caution"
    assert slopes.classify_slope(22).level == "excluded_by_planner"
    assert slopes.classify_slope(30).level == "extreme"
    assert json.dumps(slopes.classify_slope(30).to_dict())


def test_open_sky_gives_no_reduction() -> None:
    result = shielding.shielded_dose(100.0, 1.0)
    assert result.reduction_low == pytest.approx(0.0)
    assert result.reduction_high == pytest.approx(0.0)
    assert result.dose_low == pytest.approx(100.0)


def test_closed_sky_reduction_bounded_by_direct_share() -> None:
    result = shielding.shielded_dose(100.0, 0.0)
    assert result.reduction_high <= 1 - 0.18 + 1e-9
    assert result.reduction_low == pytest.approx(1 - 0.24)
    assert result.dose_low < result.dose_high
    assert result.status == "model"


def test_shielding_corridor_ordered_and_rejects_bad_input() -> None:
    result = shielding.shielded_dose(100.0, 0.5)
    assert result.dose_low <= result.dose_high
    assert result.reduction_low <= result.reduction_high
    with pytest.raises(ValueError):
        shielding.shielded_dose(100.0, 1.5)
    assert json.dumps(shielding.validation_facts().to_dict())
