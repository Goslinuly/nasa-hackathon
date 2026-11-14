"""Analysis of a team-supplied RAD extract; no spatial or safety extrapolation."""

import math
from datetime import UTC, datetime, timedelta

from pydantic import BaseModel, Field, field_validator


class RadObservation(BaseModel):
    source_row: int = Field(ge=2)
    start_utc: datetime
    sol: int = Field(ge=0)
    observation_id: int = Field(ge=0)
    duration_s: float = Field(gt=0, allow_inf_nan=False)
    rate_b_microgy_h: float = Field(ge=0, allow_inf_nan=False)
    rate_e_microgy_h: float = Field(ge=0, allow_inf_nan=False)
    qc: str = Field(pattern=r"^[01]{8}$")

    @field_validator("start_utc")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("UTC timezone is required")
        return value.astimezone(UTC)


def validate_observations(rows: list[RadObservation]) -> list[RadObservation]:
    if not rows:
        raise ValueError("No RAD observations")
    ordered = sorted(rows, key=lambda row: row.start_utc)
    keys: set[tuple[int, int]] = set()
    previous_end = None
    for row in ordered:
        key = (row.sol, row.observation_id)
        if key in keys:
            raise ValueError(f"Duplicate RAD observation: {key}")
        keys.add(key)
        if previous_end is not None and row.start_utc < previous_end:
            raise ValueError("Overlapping observations cannot be summed")
        previous_end = row.start_utc + timedelta(seconds=row.duration_s)
    return ordered


def analyze_rad(
    observations: list[RadObservation],
    start: datetime | None = None,
    end: datetime | None = None,
    include_flagged: bool = False,
) -> dict:
    rows = validate_observations(observations)
    for bound in (start, end):
        if bound is not None and bound.tzinfo is None:
            raise ValueError("Use an explicit UTC offset, e.g. 2021-11-07T12:00:00Z")
    start = start or rows[0].start_utc
    end = end or rows[-1].start_utc + timedelta(seconds=rows[-1].duration_s)
    if end <= start:
        raise ValueError("End must be later than start")
    selected = []
    excluded = 0
    cumulative_b = cumulative_e = measured_s = 0.0
    gaps = []
    cursor = start
    for row in rows:
        left = max(start, row.start_utc)
        right = min(end, row.start_utc + timedelta(seconds=row.duration_s))
        if right <= left:
            continue
        if row.qc != "00000000" and not include_flagged:
            excluded += 1
            continue
        seconds = (right - left).total_seconds()
        if left > cursor:
            gaps.append({"start_utc": cursor, "end_utc": left})
        cursor = right
        dose_b = row.rate_b_microgy_h * seconds / 3600
        dose_e = row.rate_e_microgy_h * seconds / 3600
        cumulative_b += dose_b
        cumulative_e += dose_e
        measured_s += seconds
        selected.append(
            {
                **row.model_dump(),
                "interval_start_utc": left,
                "interval_end_utc": right,
                "used_duration_s": seconds,
                "dose_b_microgy": dose_b,
                "dose_e_microgy": dose_e,
                "cumulative_b_microgy": cumulative_b,
                "cumulative_e_microgy": cumulative_e,
            }
        )
    if cursor < end:
        gaps.append({"start_utc": cursor, "end_utc": end})
    span_s = (end - start).total_seconds()

    def channel(name: str, dose: float) -> dict:
        rates = [row[f"rate_{name}_microgy_h"] for row in selected]
        return {
            "dose_microgy": dose if rates else None,
            "weighted_mean_rate_microgy_h": dose * 3600 / measured_s if rates else None,
            "min_rate_microgy_h": min(rates) if rates else None,
            "max_rate_microgy_h": max(rates) if rates else None,
        }

    assert math.isfinite(measured_s)
    return {
        "status": "observations_available" if selected else "no_observations",
        "start_utc": start,
        "end_utc": end,
        "include_flagged": include_flagged,
        "total_source_observations": len(rows),
        "selected_observations": len(selected),
        "excluded_flagged_observations": excluded,
        "measured_duration_s": measured_s,
        "unmeasured_duration_s": span_s - measured_s,
        "coverage_fraction": measured_s / span_s,
        "b": channel("b", cumulative_b),
        "e": channel("e", cumulative_e),
        "gaps": gaps,
        "observations": selected,
    }
