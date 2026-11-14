"""Типизированные марсианские координаты и сферические оценки расстояний."""

import math
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

MARS_SRID = 949900

MARS_MEAN_RADIUS_M = 3_389_500.0


def normalize_longitude_east(longitude_deg: float) -> float:
    normalized = math.fmod(longitude_deg, 360.0)
    if normalized < 0:
        normalized += 360.0
    return 0.0 if normalized == 0 else normalized


def signed_longitude_delta(from_deg: float, to_deg: float) -> float:
    delta = math.fmod(
        normalize_longitude_east(to_deg) - normalize_longitude_east(from_deg), 360.0
    )
    if delta > 180.0:
        delta -= 360.0
    elif delta <= -180.0:
        delta += 360.0
    return delta


class MarsPoint(BaseModel):
    body: Literal["Mars"] = "Mars"
    latitude_deg: float = Field(ge=-90.0, le=90.0, description="Planetocentric latitude")
    longitude_deg: float = Field(description="Восточная долгота, нормализуется в [0, 360)")
    height_m: float | None = None
    vertical_datum: str | None = None

    @field_validator("longitude_deg")
    @classmethod
    def _normalize_longitude(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("Долгота должна быть конечным числом")
        return normalize_longitude_east(value)

    @model_validator(mode="after")
    def _datum_required_with_height(self) -> "MarsPoint":
        if self.height_m is not None and not self.vertical_datum:
            raise ValueError("height_m требует указания vertical_datum")
        return self


def great_circle_distance_m(
    a: MarsPoint, b: MarsPoint, radius_m: float = MARS_MEAN_RADIUS_M
) -> float:
    lat1, lat2 = math.radians(a.latitude_deg), math.radians(b.latitude_deg)
    dlat = lat2 - lat1
    dlon = math.radians(signed_longitude_delta(a.longitude_deg, b.longitude_deg))
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * radius_m * math.asin(min(1.0, math.sqrt(h)))
