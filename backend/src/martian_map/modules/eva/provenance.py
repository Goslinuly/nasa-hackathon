"""Происхождение каждого числа: источник, статус, единицы; версии алгоритмов подмодулей."""

from dataclasses import dataclass, fields, is_dataclass
from typing import Any

ALGORITHM_VERSION = "eva-1"

MODULE_VERSIONS: dict[str, str] = {
    "mobility": "eva-1",
    "walkback": "eva-1",
    "radiation": "eva-1",
    "slopes": "eva-1",
    "shielding": "eva-1",
}

STATUSES = ("measurement", "model", "operational_rule", "estimate")


@dataclass(frozen=True)
class Provenance:
    source: str
    status: str
    units: str
    note: str = ""

    def to_dict(self) -> dict[str, Any]:
        return to_plain(self)


def to_plain(value: Any) -> Any:
    if is_dataclass(value) and not isinstance(value, type):
        return {f.name: to_plain(getattr(value, f.name)) for f in fields(value)}
    if isinstance(value, dict):
        return {str(k): to_plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_plain(v) for v in value]
    return value
