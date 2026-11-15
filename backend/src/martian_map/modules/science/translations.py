"""Английские варианты текстов исследований.

Карточки в БД хранят русские title/summary/position_evidence. Английский берётся из полей
*_en файла research_catalog.json по external_id; для набора RAD, который импорт собирает
из шаблона, английский собирается тем же шаблоном.
"""

import json
import logging
import re
from functools import lru_cache

from martian_map.config import get_settings
from martian_map.i18n import Text

logger = logging.getLogger(__name__)

CATALOG_FILENAME = "research_catalog.json"
FIELDS = ("title", "summary", "position_evidence")

RAD_TITLE = re.compile(r"^MSL RAD: архивные измерения, sol (\d+)$")
RAD_SUMMARY = re.compile(
    r"^(\d+) наблюдений, каналы B и E\. Требуется привязка координат "
    r"из первичного продукта; это не отдельные места исследования\.$"
)


@lru_cache
def catalog_english() -> dict[str, dict[str, str]]:
    path = get_settings().science_data_dir / CATALOG_FILENAME
    try:
        records = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        logger.warning("Каталог %s не прочитан: исследования останутся на русском", path)
        return {}
    result: dict[str, dict[str, str]] = {}
    for record in records if isinstance(records, list) else []:
        if not isinstance(record, dict) or not record.get("external_id"):
            continue
        result[record["external_id"]] = {
            field: record[f"{field}_en"]
            for field in FIELDS
            if isinstance(record.get(f"{field}_en"), str)
        }
    return result


def _generated_english(field: str, text: str) -> str | None:
    if field == "title" and (match := RAD_TITLE.match(text)):
        return f"MSL RAD: archival measurements, sol {match.group(1)}"
    if field == "summary" and (match := RAD_SUMMARY.match(text)):
        return (
            f"{match.group(1)} observations, channels B and E. Coordinates must be taken "
            "from the primary product; these are not separate study sites."
        )
    return None


def bilingual_card(card: dict) -> dict:
    """Поля карточки становятся парами Text; рядом кладутся *_en для клиента."""
    english = catalog_english().get(card.get("external_id") or "", {})
    for field in FIELDS:
        text = card.get(field)
        if not isinstance(text, str):
            continue
        en = english.get(field) or _generated_english(field, text)
        if en:
            card[field] = Text(text, en)
        card[f"{field}_en"] = en
    return card
