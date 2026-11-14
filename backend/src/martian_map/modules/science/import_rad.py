"""Чтение XLSX с данными RAD без исполнения формул и внешних ссылок."""

import hashlib
from datetime import UTC, datetime
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from martian_map.modules.science.rad import RadObservation, validate_observations

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
HEADERS = [
    "Start time UTC",
    "MSL sol",
    "Observation ID",
    "Duration (s)",
    "Dose rate B (microGy/h)",
    "Dose rate E (microGy/h)",
    "QC",
]


def read_rad(path: Path) -> dict:
    with ZipFile(path) as archive:
        if sum(info.file_size for info in archive.infolist()) > 20_000_000:
            raise ValueError("Workbook exceeds 20 MB uncompressed limit")
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            strings = [
                "".join(t.text or "" for t in item.findall(".//s:t", NS))
                for item in root.findall("s:si", NS)
            ]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        sheet = next(
            (s for s in workbook.findall("s:sheets/s:sheet", NS) if s.get("name") == "RAD"), None
        )
        if sheet is None:
            raise ValueError("Expected RAD worksheet")
        rel_id = sheet.get(
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        )
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel = next(r for r in rels if r.get("Id") == rel_id)
        if rel.get("TargetMode") == "External":
            raise ValueError("External worksheet is not supported")
        target = rel.attrib["Target"]
        member = target.lstrip("/") if target.startswith("/") else "xl/" + target
        root = ET.fromstring(archive.read(member))
    cells = {}
    formulas = {}
    for cell in root.findall(".//s:sheetData/s:row/s:c", NS):
        address = cell.attrib["r"]
        formula = cell.find("s:f", NS)
        if formula is not None:
            formulas[address] = formula.text or ""
        value = cell.findtext("s:v", default="", namespaces=NS)
        if cell.get("t") == "s":
            value = strings[int(value)]
        elif cell.get("t") == "inlineStr":
            value = "".join(t.text or "" for t in cell.findall(".//s:t", NS))
        cells[address] = value
    if [cells.get(f"{col}1") for col in "ABCDEFG"] != HEADERS:
        raise ValueError("Unexpected RAD headers or units in A:G")
    observations = []
    for row in root.findall(".//s:sheetData/s:row", NS):
        number = int(row.attrib["r"])
        if number == 1:
            continue
        raw = [cells.get(f"{col}{number}", "") for col in "ABCDEFG"]
        if not any(raw):
            continue
        if any(f"{col}{number}" in formulas for col in "ABCDEFG"):
            raise ValueError(f"Row {number}: source measurements must not be formulas")
        try:
            timestamp = datetime.fromisoformat(raw[0].replace("Z", "+00:00"))
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=UTC)
            observations.append(
                RadObservation(
                    source_row=number,
                    start_utc=timestamp,
                    sol=raw[1],
                    observation_id=raw[2],
                    duration_s=raw[3],
                    rate_b_microgy_h=raw[4],
                    rate_e_microgy_h=raw[5],
                    qc=raw[6],
                )
            )
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Invalid RAD source row {number}: {exc}") from exc
    observations = validate_observations(observations)
    return {
        "schema_version": 1,
        "dataset_id": "rad-" + hashlib.sha256(path.read_bytes()).hexdigest()[:16],
        "source_file": path.name,
        "source_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "source_sheet": "RAD",
        "source_columns": "A:G",
        "verification_status": "team_supplied_unverified",
        "mission": "MSL",
        "instrument": "RAD",
        "location": None,
        "source_url": None,
        "limitations": [
            "Архивный ряд RAD из файла команды; первичный продукт NASA и калибровка не сверены.",
            "Координат в файле нет: данные не привязаны к выбранной точке или маршруту.",
            "Это исторические измерения, не текущие условия и не прогноз.",
            "Доза считается отдельно для B и E: rate × duration / 3600, в мкГр. "
            "Каналы не суммируются.",
            "Столбцы H:K не используются: в исходнике есть ошибки формул и подписи E.",
            "По умолчанию используются только QC=00000000; смысл битов требует паспорта продукта.",
            "Пропуски не интерполируются. "
            "Частичный интервал использует среднюю скорость наблюдения.",
            "Показания детекторов не переводятся в дозу для человека "
            "или оценку безопасности Marswalk.",
        ],
        "derived_source_formulas": formulas,
        "observations": [row.model_dump(mode="json") for row in observations],
    }
