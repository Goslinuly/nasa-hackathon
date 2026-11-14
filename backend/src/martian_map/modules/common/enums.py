"""Статусные словари проекта. Хранятся как строки (а не PG enum), чтобы
расширение значений не требовало миграции типа; валидация — на уровне Python."""

import enum


class VerificationStatus(enum.StrEnum):
    """Жизненный цикл продукта (ТЗ §12/§20, ARCHITECTURE §5).

    Ошибка или отсутствие поля не переводит продукт на следующую стадию.
    """

    CANDIDATE = "candidate"                  # найден
    METADATA_VERIFIED = "metadata_verified"  # доступ проверен: страница и паспорт есть
    DOWNLOADED = "downloaded"                # скачан, checksum записан
    GEOMETRY_VERIFIED = "geometry_verified"  # геометрия и привязка проверены
    PROCESSED = "processed"                  # обработан (COG/тайлы/графы)
    SCIENCE_VERIFIED = "science_verified"    # научно проверен
    PUBLISHED = "published"                  # включён в активную публикацию


class DataLevel(enum.StrEnum):
    """Уровень данных сегмента маршрута (ТЗ §1, §26)."""

    LOCAL_DTM = "local_dtm"
    ORBITAL_OVERVIEW = "orbital_overview"
    UNASSESSED = "unassessed"


class EvidenceType(enum.StrEnum):
    """Статус достоверности научной записи (ТЗ §5)."""

    MEASUREMENT = "measurement"
    DERIVED = "derived"
    MODEL = "model"
    REFERENCE = "reference"
    NO_DATA = "no_data"


class JobStatus(enum.StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class FootprintKind(enum.StrEnum):
    """Геометрия продукта и валидная область после маски NoData — разные вещи."""

    PRODUCT_EXTENT = "product_extent"
    VALID_DATA = "valid_data"
