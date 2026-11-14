"""Проверки координатного контракта (ARCHITECTURE §9: шов 359°/0°, опорные точки)."""

import math

import pytest
from pydantic import ValidationError

from martian_map.modules.coordinates import (
    MARS_MEAN_RADIUS_M,
    MarsPoint,
    great_circle_distance_m,
    normalize_longitude_east,
    signed_longitude_delta,
)


class TestNormalizeLongitude:
    def test_already_normalized(self):
        assert normalize_longitude_east(77.43) == pytest.approx(77.43)

    def test_negative_longitude(self):
        assert normalize_longitude_east(-90.0) == pytest.approx(270.0)

    def test_minus_180_and_180_map_to_same_meridian(self):
        assert normalize_longitude_east(-180.0) == pytest.approx(
            normalize_longitude_east(180.0)
        )

    def test_360_wraps_to_zero(self):
        assert normalize_longitude_east(360.0) == 0.0
        assert normalize_longitude_east(0.0) == 0.0

    def test_multiple_wraps(self):
        assert normalize_longitude_east(725.0) == pytest.approx(5.0)
        assert normalize_longitude_east(-725.0) == pytest.approx(355.0)


class TestSignedDelta:
    def test_across_seam(self):
        # 359° -> 1°: кратчайший путь +2°, а не -358°
        assert signed_longitude_delta(359.0, 1.0) == pytest.approx(2.0)
        assert signed_longitude_delta(1.0, 359.0) == pytest.approx(-2.0)

    def test_antipodal(self):
        assert abs(signed_longitude_delta(0.0, 180.0)) == pytest.approx(180.0)


class TestMarsPoint:
    def test_normalizes_longitude_on_input(self):
        point = MarsPoint(latitude_deg=18.44, longitude_deg=-282.57)
        assert point.longitude_deg == pytest.approx(77.43)
        assert point.body == "Mars"

    def test_latitude_out_of_range_rejected(self):
        with pytest.raises(ValidationError):
            MarsPoint(latitude_deg=91.0, longitude_deg=0.0)

    def test_height_requires_datum(self):
        with pytest.raises(ValidationError):
            MarsPoint(latitude_deg=0.0, longitude_deg=0.0, height_m=-2500.0)
        point = MarsPoint(
            latitude_deg=0.0, longitude_deg=0.0, height_m=-2500.0, vertical_datum="areoid"
        )
        assert point.vertical_datum == "areoid"


class TestGreatCircle:
    def test_zero_distance(self):
        a = MarsPoint(latitude_deg=18.44, longitude_deg=77.43)
        assert great_circle_distance_m(a, a) == 0.0

    def test_quarter_circumference_along_equator(self):
        a = MarsPoint(latitude_deg=0.0, longitude_deg=0.0)
        b = MarsPoint(latitude_deg=0.0, longitude_deg=90.0)
        expected = math.pi * MARS_MEAN_RADIUS_M / 2
        assert great_circle_distance_m(a, b) == pytest.approx(expected, rel=1e-9)

    def test_seam_does_not_inflate_distance(self):
        a = MarsPoint(latitude_deg=0.0, longitude_deg=359.5)
        b = MarsPoint(latitude_deg=0.0, longitude_deg=0.5)
        one_degree = math.pi * MARS_MEAN_RADIUS_M / 180
        assert great_circle_distance_m(a, b) == pytest.approx(one_degree, rel=1e-9)

    def test_pole_to_pole(self):
        a = MarsPoint(latitude_deg=90.0, longitude_deg=0.0)
        b = MarsPoint(latitude_deg=-90.0, longitude_deg=123.0)
        assert great_circle_distance_m(a, b) == pytest.approx(
            math.pi * MARS_MEAN_RADIUS_M, rel=1e-9
        )
