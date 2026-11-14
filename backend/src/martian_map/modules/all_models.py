"""Единая точка регистрации всех моделей в metadata (для Alembic и create_all)."""

from martian_map.modules.catalog import models as catalog_models
from martian_map.modules.panoramas import models as panoramas_models
from martian_map.modules.publication import models as publication_models
from martian_map.modules.routing import models as routing_models
from martian_map.modules.science import models as science_models

__all__ = [
    "catalog_models",
    "science_models",
    "panoramas_models",
    "routing_models",
    "publication_models",
]
