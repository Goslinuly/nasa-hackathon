"""Типизированные марсианские координаты.

Внутреннее соглашение проекта (ТЗ §7, §21.3; ARCHITECTURE §4):
body="Mars", planetocentric latitude в градусах, восточная долгота в [0, 360).
Исходные определения продукта (planetographic latitude, западная долгота,
диапазон ±180) хранятся в каталоге отдельно и преобразуются явно —
переименование поля преобразованием не считается.

Земные EPSG:4326/3857 и тип geography к марсианским расстояниям не применяются.
"""

import math
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# Внутренний SRID проекта для планетарного каталога (Mars 2000, planetocentric,
# восточная долгота). Регистрируется в spatial_ref_sys миграцией Alembic;
# назначение должно пройти интеграционный тест до загрузки каталога.
MARS_SRID = 949900

# Средний радиус Марса (IAU). Только для сферических ОЦЕНОК обзорного масштаба;
# локальные метрические расчёты выполняются в локальной проекции района.
MARS_MEAN_RADIUS_M = 3_389_500.0


def normalize_longitude_east(longitude_deg: float) -> float:
    """Приводит долготу к восточной в интервале [0, 360).

    Принимает и ±180, и уже нормализованные значения; 360.0 становится 0.0.
    """
    normalized = math.fmod(longitude_deg, 360.0)
    if normalized < 0:
        normalized += 360.0
    # fmod может вернуть 360.0 - eps -> оставляем; ровно 360 после сложения не бывает,
    # но защищаемся от -0.0.
    return 0.0 if normalized == 0 else normalized


def signed_longitude_delta(from_deg: float, to_deg: float) -> float:
    """Кратчайшая угловая разность долгот в (-180, 180] с учётом шва 0°/360°."""
    delta = math.fmod(
        normalize_longitude_east(to_deg) - normalize_longitude_east(from_deg), 360.0
    )
    if delta > 180.0:
        delta -= 360.0
    elif delta <= -180.0:
        delta += 360.0
    return delta


class MarsPoint(BaseModel):
    """Каноническая точка на Марсе для API и БД.

    Долгота нормализуется на входе; широта planetocentric. Высота, если есть,
    обязана сопровождаться вертикальным датумом.
    """

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
    """Сферическая оценка расстояния (haversine) для ОБЗОРНОГО масштаба.

    Это модельная оценка по среднему радиусу, не локальная метрика: для
    локальных расстояний использовать метрическую проекцию района.
    """
    lat1, lat2 = math.radians(a.latitude_deg), math.radians(b.latitude_deg)
    dlat = lat2 - lat1
    dlon = math.radians(signed_longitude_delta(a.longitude_deg, b.longitude_deg))
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * radius_m * math.asin(min(1.0, math.sqrt(h)))
