"""Load RAD into DB; optionally add geolocated studies from a JSON array."""

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from martian_map.config import get_settings  # noqa: E402
from martian_map.infrastructure.db import get_session_factory  # noqa: E402
from martian_map.modules import all_models  # noqa: E402,F401
from martian_map.modules.science.research import ResearchInput  # noqa: E402
from martian_map.modules.science.research_import import (  # noqa: E402
    import_rad_database,
    import_research_catalog,
)

# Каталог рядом с остальными данными науки: иначе его надо передавать флагом,
# а на платформе команду запуска никто не правит — и каталог молча остаётся
# пустым, из-за чего поиск исследований всегда возвращает ноль.
DEFAULT_CATALOG_NAME = "research_catalog.json"


async def seed(catalog: Path | None = None) -> None:
    directory = get_settings().science_data_dir
    if catalog is None:
        default = directory / DEFAULT_CATALOG_NAME
        catalog = default if default.exists() else None
    dataset = json.loads((directory / "rad.json").read_text(encoding="utf-8"))
    intake = json.loads((directory / "intake.json").read_text(encoding="utf-8"))
    records = (
        []
        if catalog is None
        else [
            ResearchInput.model_validate(item)
            for item in json.loads(catalog.read_text(encoding="utf-8"))
        ]
    )
    async with get_session_factory()() as session, session.begin():
        result = await import_rad_database(session, dataset, intake)
        result["catalog_records"] = await import_research_catalog(session, records)
    print(json.dumps(result))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--catalog",
        type=Path,
        help=f"JSON-массив записей; по умолчанию {DEFAULT_CATALOG_NAME} рядом с данными науки",
    )
    asyncio.run(seed(parser.parse_args().catalog))
