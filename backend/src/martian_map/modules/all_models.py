"""Единая точка регистрации всех моделей в metadata (для Alembic и create_all)."""

from martian_map.modules.catalog import models as catalog_models
from martian_map.modules.science import models as science_models

__all__ = [
    "catalog_models",
    "science_models",
]
