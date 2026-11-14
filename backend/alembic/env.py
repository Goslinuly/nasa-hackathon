import sys

from alembic import context
from pydantic import ValidationError
from sqlalchemy import create_engine, pool

from martian_map.config import format_settings_error, get_settings
from martian_map.infrastructure.db import Base
from martian_map.modules import all_models  # noqa: F401  (регистрация моделей в metadata)

config = context.config
# Своя команда запуска в панели платформы может обойти проверку из CMD,
# а alembic стартует первым в любом варианте — объясняем ошибку и здесь.
try:
    DATABASE_URL = get_settings().sync_database_url
except ValidationError as error:
    print(format_settings_error(error), file=sys.stderr)
    raise SystemExit(1) from None

# URL берём напрямую, а не через config.set_main_option: alembic хранит
# настройки в ConfigParser, где «%» начинает подстановку. Пароль с «%»
# (а такие генерирует в том числе Railway) там портится, и ошибка вылезает
# уже внутри SQLAlchemy как невнятное «Could not parse SQLAlchemy URL».

target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to):  # noqa: ANN001
    """Не трогать служебные таблицы PostGIS при autogenerate."""
    if type_ == "table" and name in {"spatial_ref_sys"}:
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        include_object=include_object,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(DATABASE_URL, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
