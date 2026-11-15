"""Английские варианты текстов каталога из data/product_registry.json.

В БД лежат русские тексты реестра (описания районов, заметки, названия продуктов).
Перевод берётся из полей *_en того же файла: русский текст → английский.
"""

import json
import logging
from functools import lru_cache

from martian_map.config import get_settings
from martian_map.i18n import get_lang

logger = logging.getLogger(__name__)

REGISTRY_FILENAME = "product_registry.json"


def _collect(node: object, pairs: dict[str, str]) -> None:
    if isinstance(node, dict):
        for key, value in node.items():
            if key.endswith("_en") and isinstance(value, str):
                original = node.get(key[: -len("_en")])
                if isinstance(original, str) and original:
                    pairs[original] = value
            _collect(value, pairs)
    elif isinstance(node, list):
        for item in node:
            _collect(item, pairs)


@lru_cache
def registry_english() -> dict[str, str]:
    path = get_settings().science_data_dir.parent / REGISTRY_FILENAME
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        logger.warning("Реестр %s не прочитан: тексты каталога останутся русскими", path)
        return {}
    pairs: dict[str, str] = {}
    _collect(data, pairs)
    return pairs


def registry_text(text: str | None) -> str | None:
    """Текст реестра на языке запроса; без перевода — как есть."""
    if text is None or get_lang() != "en":
        return text
    return registry_english().get(text, text)
