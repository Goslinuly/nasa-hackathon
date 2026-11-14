"""Импорт присланных научных файлов: python scripts/import_weekly_science.py FILE [FILE ...]."""

import argparse
import hashlib
import json
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from martian_map.modules.science.import_rad import read_rad


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument(
        "--output", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "science"
    )
    args = parser.parse_args()
    sources = []
    datasets = []
    seen = {}
    for path in args.files:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        item = {"filename": path.name, "sha256": digest, "size_bytes": path.stat().st_size}
        if digest in seen:
            item.update(
                status="duplicate",
                reason="Побайтовая копия другого файла.",
                duplicate_of=seen[digest],
            )
        elif path.suffix.lower() == ".xlsx":
            dataset = read_rad(path)
            datasets.append(dataset)
            item.update(
                status="imported_unverified",
                reason="RAD: исходные A:G импортированы; H:K пересчитываются кодом.",
                dataset_id=dataset["dataset_id"],
                records=len(dataset["observations"]),
            )
        elif path.suffix.lower() == ".crtx":
            with ZipFile(path) as archive:
                root = ET.fromstring(archive.read("chart/chart.xml"))
                points = root.findall(
                    ".//{http://schemas.openxmlformats.org/drawingml/2006/chart}pt"
                )
                embedded = [n for n in archive.namelist() if "/embeddings/" in n]
            item.update(
                status="needs_source_table",
                cached_points=len(points),
                embedded_workbooks=len(embedded),
                reason=(
                    "Шаблон диаграммы; нужен исходный CSV/XLSX с координатами, "
                    "высотами, единицами и источником MOLA."
                ),
            )
        elif path.suffix.lower() == ".docx":
            with ZipFile(path) as archive:
                root = ET.fromstring(archive.read("word/document.xml"))
                ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                first = root.find("w:body/w:p", ns)
                title = (
                    ""
                    if first is None
                    else "".join(node.text or "" for node in first.findall(".//w:t", ns))
                )
            item.update(
                status="reference_only",
                title=title,
                reason=f"Текстовый документ «{title}»; марсианские измерения не импортированы.",
            )
        else:
            item.update(
                status="not_imported",
                reason="Формат не поддерживается для импорта марсианских измерений.",
            )
        seen.setdefault(digest, path.name)
        sources.append(item)
    if len(datasets) != 1:
        raise ValueError("This batch must contain exactly one RAD workbook")
    args.output.mkdir(parents=True, exist_ok=True)
    for name, data in [("rad.json", datasets[0]), ("intake.json", {"sources": sources})]:
        dest = args.output / name
        temporary = dest.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        temporary.replace(dest)
    print(
        f"Imported {len(datasets[0]['observations'])} RAD observations; "
        f"inventoried {len(sources)} files."
    )


if __name__ == "__main__":
    main()
