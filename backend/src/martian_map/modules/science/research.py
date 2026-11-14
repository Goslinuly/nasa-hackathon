"""Research storage and overview corridor search on the Mars sphere."""

import math
from typing import Literal, NamedTuple

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from martian_map.modules.coordinates.types import MARS_MEAN_RADIUS_M, MarsPoint
from martian_map.modules.science.models import ResearchStudy


class ResearchInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    external_id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=300)
    summary: str = Field(min_length=1)
    source_url: HttpUrl
    mission: str | None = Field(default=None, max_length=100)
    instrument: str | None = Field(default=None, max_length=100)
    point: MarsPoint | None = None
    position_evidence: str | None = Field(default=None, min_length=1)
    position_uncertainty_m: float | None = Field(default=None, ge=0)
    verification_status: Literal["team_supplied_unverified", "source_verified"] = (
        "team_supplied_unverified"
    )

    @model_validator(mode="after")
    def evidence_required(self):
        if self.point and not (self.position_evidence or "").strip():
            raise ValueError("A position needs a citation to coordinate evidence")
        return self


class ResearchRouteInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    points: list[MarsPoint] = Field(min_length=2, max_length=50)
    corridor_m: float = Field(default=500, gt=0, le=50000)
    limit: int = Field(default=100, ge=1, le=500)


def vector(point: MarsPoint) -> tuple[float, float, float]:
    lat, lon = math.radians(point.latitude_deg), math.radians(point.longitude_deg)
    return math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b, strict=True))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(v):
    return math.sqrt(dot(v, v))


def angle(a, b):
    return math.atan2(norm(cross(a, b)), max(-1, min(1, dot(a, b))))


def prepare_route(points: list[MarsPoint]):
    segments = []
    distance = 0.0
    coordinates = [[points[0].longitude_deg, points[0].latitude_deg]]
    for a_point, b_point in zip(points[:-1], points[1:], strict=True):
        a, b = vector(a_point), vector(b_point)
        arc = angle(a, b)
        if math.pi - arc < 1e-7:
            raise ValueError("Для противоположных точек Марса добавьте промежуточную точку.")
        segments.append((a, b, arc, distance))
        if arc > 1e-12:
            n = cross(a, b)
            n = tuple(x / norm(n) for x in n)
            tangent = cross(n, a)
            count = max(1, math.ceil(arc / math.radians(1)))
            for i in range(count):
                t = arc * i / count
                v = tuple(
                    math.cos(t) * x + math.sin(t) * y for x, y in zip(a, tangent, strict=True)
                )
                coordinates.append(
                    [
                        math.degrees(math.atan2(v[1], v[0])) % 360,
                        math.degrees(math.atan2(v[2], math.hypot(v[0], v[1]))),
                    ]
                )
        distance += arc * MARS_MEAN_RADIUS_M
    coordinates.append([points[-1].longitude_deg, points[-1].latitude_deg])
    return segments, distance, coordinates


class RouteOffset(NamedTuple):
    """Положение точки относительно маршрута: удаление, путь от старта, сторона."""

    distance_m: float
    along_m: float
    side: Literal["left", "right", "on_line"]


# Ближе этого от линии говорить «слева» или «справа» бессмысленно.
ON_LINE_M = 1.0

# Сколько ближайших исследований за коридором показывать: это подсказка,
# куда посмотреть, а не второй список результатов.
NEARBY_LIMIT = 5


def route_offset(point: MarsPoint, segments) -> RouteOffset:
    p = vector(point)
    best = (float("inf"), 0.0)
    best_side: Literal["left", "right", "on_line"] = "on_line"
    for a, b, arc, offset in segments:
        candidates = [(angle(p, a), 0.0), (angle(p, b), arc)]
        normal = None
        if arc > 1e-12:
            normal = cross(a, b)
            normal = tuple(x / norm(normal) for x in normal)
            tangent = cross(normal, a)
            t = math.atan2(dot(p, tangent), dot(p, a))
            if 0 <= t <= arc:
                foot = tuple(
                    math.cos(t) * x + math.sin(t) * y for x, y in zip(a, tangent, strict=True)
                )
                candidates.append((angle(p, foot), t))
        for separation, along in candidates:
            candidate = (separation * MARS_MEAN_RADIUS_M, offset + along * MARS_MEAN_RADIUS_M)
            if candidate < best:
                best = candidate
                # Нормаль a×b смотрит влево от направления движения: для пути
                # на восток по экватору она указывает на северный полюс.
                if normal is None:
                    best_side = "on_line"
                else:
                    best_side = "left" if dot(p, normal) > 0 else "right"
    distance_m, along_m = best
    return RouteOffset(distance_m, along_m, "on_line" if distance_m < ON_LINE_M else best_side)


def nearest_on_route(point: MarsPoint, segments) -> tuple[float, float]:
    """Удаление от маршрута и путь от старта. Сторона — в route_offset."""
    offset = route_offset(point, segments)
    return offset.distance_m, offset.along_m


def study_card(study: ResearchStudy) -> dict:
    return {
        "id": study.id,
        "external_id": study.external_id,
        "title": study.title,
        "summary": study.summary,
        "mission": study.mission,
        "instrument": study.instrument,
        "source_url": study.source_url,
        "verification_status": study.verification_status,
        "latitude_deg": study.latitude_deg,
        "longitude_deg": study.longitude_deg,
        "position_evidence": study.position_evidence,
        "position_uncertainty_m": study.position_uncertainty_m,
    }


async def find_research(session: AsyncSession, query: ResearchRouteInput) -> dict:
    segments, length, coordinates = prepare_route(query.points)
    found = []
    # Stream the initial catalog without a silent candidate cap; never use Earth geography.
    result = await session.stream_scalars(
        select(ResearchStudy).where(
            ResearchStudy.latitude_deg.is_not(None), ResearchStudy.longitude_deg.is_not(None)
        )
    )
    outside = []
    async for study in result:
        offset = route_offset(
            MarsPoint(latitude_deg=study.latitude_deg, longitude_deg=study.longitude_deg), segments
        )
        row = {
            **study_card(study),
            "distance_from_route_m": offset.distance_m,
            "distance_from_start_m": offset.along_m,
            "side": offset.side,
        }
        (found if offset.distance_m <= query.corridor_m else outside).append(row)
    found.sort(key=lambda row: (row["distance_from_start_m"], row["id"]))
    # Пустой коридор — ещё не «ничего вокруг нет»: подсказываем, что рядом и с
    # какой стороны, не перенося эти исследования на сам маршрут.
    outside.sort(key=lambda row: (row["distance_from_route_m"], row["id"]))
    unlocated = await session.scalar(
        select(func.count()).select_from(ResearchStudy).where(ResearchStudy.latitude_deg.is_(None))
    )
    return {
        "route_length_m": length,
        "corridor_m": query.corridor_m,
        "geometry": {"type": "LineString", "coordinates": coordinates},
        "method": "mars_mean_sphere_overview",
        "radius_m": MARS_MEAN_RADIUS_M,
        "explanation": "Обзорный коридор поиска по сфере Марса. Это не проверенная "
        "проходимая тропа; расстояния приближённые. Наличие исследования "
        "рядом не переносит его измерения на маршрут.",
        "matched_total": len(found),
        "truncated": len(found) > query.limit,
        "unlocated_studies": unlocated,
        "studies": found[: query.limit],
        "nearby_total": len(outside),
        "nearby": outside[:NEARBY_LIMIT],
    }
