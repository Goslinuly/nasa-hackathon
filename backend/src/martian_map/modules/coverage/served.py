"""Продукты, которые приложение действительно отдаёт: footprint, разрешение, статус.

`product_registry.json` хранит кандидатов: метаданные проверены, растры не скачаны.
Здесь читается `served_products.json` — то, что лежит в сборке и отдаётся пользователю.
Уровень данных точки считается по этому файлу, иначе каталог кандидатов делает
«недостаточно данных» ответом для всего Марса, включая участки, которые сам же сайт
отдаёт в метре на пиксель.

Тексты хранятся парой (русский, английский) и переводятся в сервисе через `t()`:
Pydantic приводит подклассы `str` к обычной строке, поэтому `Text` сюда не кладём.
"""

import json
import logging
from dataclasses import dataclass
from functools import lru_cache

from martian_map.config import get_settings
from martian_map.modules.common.enums import VerificationStatus
from martian_map.modules.coordinates.types import normalize_longitude_east

logger = logging.getLogger(__name__)

SERVED_FILENAME = "served_products.json"


@dataclass(frozen=True)
class Bilingual:
    """Пара текстов; `None` у отсутствующего значения, чтобы не выдумывать перевод."""

    ru: str
    en: str

    @classmethod
    def read(cls, node: dict, key: str) -> "Bilingual | None":
        ru = node.get(key)
        if not isinstance(ru, str) or not ru:
            return None
        en = node.get(f"{key}_en")
        return cls(ru, en if isinstance(en, str) and en else ru)


@dataclass(frozen=True)
class Bounds:
    """Границы в восточных долготах; `west > east` означает переход через 0°."""

    west: float
    south: float
    east: float
    north: float

    def contains(self, latitude_deg: float, longitude_deg: float) -> bool:
        if not self.south <= latitude_deg <= self.north:
            return False
        if self.east - self.west >= 360:
            return True
        lon = normalize_longitude_east(longitude_deg)
        west = normalize_longitude_east(self.west)
        east = normalize_longitude_east(self.east)
        if self.east == 360 and self.west == 0:
            return True
        return west <= lon <= east if west <= east else lon >= west or lon <= east


@dataclass(frozen=True)
class ServedProduct:
    product_id: str
    title: Bilingual
    kind: str
    resolution_m: float | None
    verification_status: str
    license: str | None
    credit: str | None
    note: Bilingual | None
    source_resolution_m: float | None = None
    served_file: str | None = None
    sha256: str | None = None

    @property
    def published(self) -> bool:
        return self.verification_status == VerificationStatus.PUBLISHED.value


@dataclass(frozen=True)
class ServedGlobalProduct(ServedProduct):
    bounds: Bounds = Bounds(0, -90, 360, 90)


@dataclass(frozen=True)
class ServedPackage:
    """Локальный пакет участка: он же открывает прогулку по адресу `walk_url`."""

    slug: str
    title: Bilingual
    bounds: Bounds
    walk_url: str | None
    products: tuple[ServedProduct, ...]
    source_mix: Bilingual | None = None
    hirise_fraction: float | None = None

    @property
    def best_resolution_m(self) -> float | None:
        values = [p.resolution_m for p in self.products if p.kind == "dtm" and p.resolution_m]
        return min(values) if values else None


@dataclass(frozen=True)
class Served:
    global_products: tuple[ServedGlobalProduct, ...]
    packages: tuple[ServedPackage, ...]
    checked: str | None = None


def _product(node: dict) -> ServedProduct:
    return ServedProduct(
        product_id=node["product_id"],
        title=Bilingual.read(node, "title") or Bilingual(node["product_id"], node["product_id"]),
        kind=node["kind"],
        resolution_m=node.get("resolution_m"),
        verification_status=node.get("verification_status", VerificationStatus.CANDIDATE.value),
        license=node.get("license"),
        credit=node.get("credit"),
        note=Bilingual.read(node, "note"),
        source_resolution_m=node.get("source_resolution_m"),
        served_file=node.get("served_file"),
        sha256=node.get("sha256"),
    )


def _bounds(node: dict) -> Bounds:
    return Bounds(node["west"], node["south"], node["east"], node["north"])


def _package(node: dict) -> ServedPackage:
    mix = node.get("source_mix") or {}
    return ServedPackage(
        slug=node["package"],
        title=Bilingual.read(node, "package_title") or Bilingual(node["package"], node["package"]),
        bounds=_bounds(node["bounds"]),
        walk_url=node.get("walk_url"),
        products=tuple(_product(item) for item in node.get("products", [])),
        source_mix=Bilingual.read(mix, "note"),
        hirise_fraction=mix.get("hirise_fraction"),
    )


EMPTY = Served(global_products=(), packages=())


@lru_cache
def load_served() -> Served:
    path = get_settings().science_data_dir.parent / SERVED_FILENAME
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        logger.warning("Файл %s не прочитан: покрытие точки останется неоценённым", path)
        return EMPTY
    try:
        globals_ = tuple(
            ServedGlobalProduct(**vars(_product(node)), bounds=_bounds(node["bounds"]))
            for node in data.get("global", [])
        )
        packages = tuple(_package(node) for node in data.get("local", []))
    except (KeyError, TypeError) as error:
        logger.warning(
            "Файл %s не разобран (%s): покрытие точки останется неоценённым", path, error
        )
        return EMPTY
    return Served(globals_, packages, checked=data.get("meta", {}).get("checked"))


def package_at(latitude_deg: float, longitude_deg: float) -> ServedPackage | None:
    """Подробный пакет, в границы которого попадает точка."""
    for package in load_served().packages:
        if package.bounds.contains(latitude_deg, longitude_deg):
            return package
    return None


def global_products_at(
    latitude_deg: float, longitude_deg: float
) -> tuple[ServedGlobalProduct, ...]:
    """Обзорные продукты сборки, покрывающие точку."""
    return tuple(
        product
        for product in load_served().global_products
        if product.bounds.contains(latitude_deg, longitude_deg)
    )
