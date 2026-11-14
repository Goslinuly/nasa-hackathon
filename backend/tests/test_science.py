"""Тесты научных расчётов и разбора загружаемых данных RAD."""
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from zipfile import ZipFile

import httpx
import pytest
from pydantic import ValidationError

from martian_map.api.main import create_app
from martian_map.config import get_settings
from martian_map.modules.science.import_rad import HEADERS, read_rad
from martian_map.modules.science.rad import RadObservation, analyze_rad, validate_observations

DATA = Path(__file__).resolve().parents[1] / "data" / "science"
START = datetime(2021, 11, 7, tzinfo=UTC)


def observation(**kwargs):
    return RadObservation.model_validate(
        {
            "source_row": 2,
            "start_utc": START,
            "sol": 3290,
            "observation_id": 0,
            "duration_s": 3600,
            "rate_b_microgy_h": 10,
            "rate_e_microgy_h": 20,
            "qc": "00000000",
            **kwargs,
        }
    )


def test_integral_clipping_gaps_and_duration_weighted_mean():
    rows = [
        observation(),
        observation(
            source_row=3,
            observation_id=2,
            start_utc=START + timedelta(hours=2),
            duration_s=1800,
            rate_b_microgy_h=30,
            rate_e_microgy_h=40,
        ),
    ]
    result = analyze_rad(rows, start=START + timedelta(minutes=30), end=START + timedelta(hours=3))
    assert result["b"]["dose_microgy"] == 20
    assert result["e"]["dose_microgy"] == 30
    assert result["b"]["weighted_mean_rate_microgy_h"] == 20
    assert result["measured_duration_s"] == 3600
    assert result["unmeasured_duration_s"] == 5400
    assert len(result["gaps"]) == 2


def test_flagged_records_are_optional_and_empty_is_not_zero_dose():
    rows = [observation(qc="00000001")]
    filtered = analyze_rad(rows)
    assert filtered["status"] == "no_observations"
    assert filtered["b"]["dose_microgy"] is None
    assert filtered["excluded_flagged_observations"] == 1
    assert analyze_rad(rows, include_flagged=True)["b"]["dose_microgy"] == 10
    outside = analyze_rad(rows, START + timedelta(days=1), START + timedelta(days=2))
    assert outside["selected_observations"] == 0
    assert outside["coverage_fraction"] == 0
    assert outside["unmeasured_duration_s"] == 86400


@pytest.mark.parametrize(
    "kwargs",
    [
        {"duration_s": 0},
        {"duration_s": float("inf")},
        {"rate_e_microgy_h": -1},
        {"rate_b_microgy_h": float("nan")},
        {"qc": "bad"},
        {"start_utc": datetime(2021, 11, 7)},
    ],
)
def test_invalid_measurements_rejected(kwargs):
    with pytest.raises(ValidationError):
        observation(**kwargs)


def test_duplicates_and_overlapping_observations_rejected():
    with pytest.raises(ValueError, match="Duplicate"):
        validate_observations([observation(), observation()])
    with pytest.raises(ValueError, match="Overlapping"):
        validate_observations([observation(), observation(observation_id=2)])


def make_xlsx(path, source_formula=False):
    cells = [
        f'<c r="{col}1" t="inlineStr"><is><t>{header}</t></is></c>'
        for col, header in zip("ABCDEFG", HEADERS, strict=True)
    ]
    values = ["2021-11-07T00:00:00", "3290", "0", "1800", "10", "20", "00000000"]
    data = [
        f'<c r="{col}2" t="inlineStr"><is><t>{value}</t></is></c>'
        for col, value in zip("ABCDEFG", values, strict=True)
    ]
    if source_formula:
        data[4] = '<c r="E2"><f>5+5</f><v>10</v></c>'
    with ZipFile(path, "w") as archive:
        archive.writestr(
            "xl/workbook.xml",
            """<workbook
          xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets><sheet name="RAD" sheetId="1" r:id="rId1"/></sheets></workbook>""",
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            """<Relationships
          xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>""",
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            "<worksheet "
            'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
            '<row r="1">'
            + "".join(cells)
            + '</row><row r="2">'
            + "".join(data)
            + '<c r="I2"><f>F2*E2/3600</f><v>999</v></c></row></sheetData></worksheet>',
        )


def test_import_ignores_wrong_derived_formulas_and_preserves_provenance(tmp_path):
    path = tmp_path / "rad.xlsx"
    make_xlsx(path)
    imported = read_rad(path)
    assert imported["source_sheet"] == "RAD"
    assert len(imported["source_sha256"]) == 64
    assert imported["derived_source_formulas"]["I2"] == "F2*E2/3600"
    rows = [RadObservation.model_validate(row) for row in imported["observations"]]
    assert analyze_rad(rows)["e"]["dose_microgy"] == 10
    make_xlsx(path, source_formula=True)
    with pytest.raises(ValueError, match="must not be formulas"):
        read_rad(path)


def test_supplied_dataset_counts_and_independent_integrals():
    data = json.loads((DATA / "rad.json").read_text(encoding="utf-8"))
    rows = [RadObservation.model_validate(row) for row in data["observations"]]
    assert len(rows) == 87
    assert sum(row.qc != "00000000" for row in rows) == 3
    result = analyze_rad(rows)
    assert result["selected_observations"] == 84
    assert result["measured_duration_s"] == 80724
    assert result["b"]["dose_microgy"] == pytest.approx(244.13882798055556)
    assert result["e"]["dose_microgy"] == pytest.approx(261.38594303055556)
    all_rows = analyze_rad(rows, include_flagged=True)
    assert all_rows["b"]["dose_microgy"] == pytest.approx(249.09106990833333)
    assert all_rows["e"]["dose_microgy"] == pytest.approx(266.7381837388889)
    assert data["location"] is None
    assert result["end_utc"].date().isoformat() == "2021-11-08"


async def test_api_science_without_database(monkeypatch):
    monkeypatch.setattr(get_settings(), "science_data_dir", DATA)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=create_app()), base_url="http://test"
    ) as client:
        response = await client.get("/api/v1/science/rad")
        assert response.status_code == 200
        assert response.json()["analysis"]["selected_observations"] == 84
        for params in [
            {"start": "2021-11-08T00:00:00"},
            {"start": "2021-11-09T00:00:00Z", "end": "2021-11-08T00:00:00Z"},
        ]:
            assert (await client.get("/api/v1/science/rad", params=params)).status_code == 422
        intake = (await client.get("/api/v1/science/intake")).json()
        assert len(intake["sources"]) == 5
        assert sum(s["status"] == "duplicate" for s in intake["sources"]) == 1
        monkeypatch.setattr(get_settings(), "science_data_dir", DATA / "missing")
        assert (await client.get("/api/v1/science/rad")).status_code == 503
