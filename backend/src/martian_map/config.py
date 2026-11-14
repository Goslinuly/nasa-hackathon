from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from pydantic import AliasChoices, Field, ValidationError, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

# Порт 5433 — проброшенный порт контейнера из infra/docker-compose.yml.
LOCAL_DATABASE_URL = "postgresql+asyncpg://martian:martian@localhost:5433/martian_map"


def mask_password(url: str) -> str:
    """Прячет пароль, чтобы строку подключения можно было показать в логе.

    Работает и со строкой без схемы: именно такие сюда и попадают, когда
    переменная задана неправильно, а пароль в них всё равно настоящий.
    """
    prefix, separator, rest = url.partition("//")
    if not separator:
        prefix, rest = "", url
    # Хост отделяет последний «@»: сам пароль может содержать «@».
    authority, at_sign, tail = rest.rpartition("@")
    if not at_sign:
        return url
    user, colon, _ = authority.partition(":")
    if not colon:
        return url
    return f"{prefix}{separator}{user}:***{at_sign}{tail}"


def _to_asyncpg(url: str) -> str:
    """Приводит схему платформы к драйверу, который мы используем."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


class Settings(BaseSettings):
    """Конфигурация через переменные окружения с префиксом MARTIAN_ (см. .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="MARTIAN_", extra="ignore")

    env: str = "dev"
    science_data_dir: Path = Path(__file__).resolve().parents[2] / "data" / "science"
    # Платформы отдают готовую DATABASE_URL; схема postgres:// нормализуется.
    database_url: str = Field(
        default=LOCAL_DATABASE_URL,
        validation_alias=AliasChoices("MARTIAN_DATABASE_URL", "DATABASE_URL"),
    )

    # Части подключения по отдельности, имена как у libpq. Нужны там, где у
    # сервиса базы нет готовой DATABASE_URL — например, Postgres поднят из
    # обычного Docker-образа и отдаёт только POSTGRES_USER/PASSWORD/DB.
    # Собрать URL из частей надёжнее, чем склеивать строку руками: пароль
    # здесь кодируется, и опечатка в одной ссылке не ломает всю строку.
    pg_host: str = Field(default="", validation_alias=AliasChoices("MARTIAN_PGHOST", "PGHOST"))
    pg_port: int = Field(default=5432, validation_alias=AliasChoices("MARTIAN_PGPORT", "PGPORT"))
    pg_user: str = Field(default="", validation_alias=AliasChoices("MARTIAN_PGUSER", "PGUSER"))
    pg_password: str = Field(
        default="", validation_alias=AliasChoices("MARTIAN_PGPASSWORD", "PGPASSWORD")
    )
    pg_database: str = Field(
        default="", validation_alias=AliasChoices("MARTIAN_PGDATABASE", "PGDATABASE")
    )

    redis_url: str = "redis://localhost:6379/0"

    object_store_endpoint: str = "http://localhost:9000"
    object_store_access_key: str = "martian"
    object_store_secret_key: str = "martian-dev-secret"
    object_store_bucket: str = "martian-map"

    cors_origins: list[str] = ["http://localhost:5173"]

    @model_validator(mode="after")
    def _resolve_database_url(self) -> "Settings":
        url = self.database_url.strip()

        # Части подключения важнее встроенного значения для локальной разработки,
        # но заданную руками DATABASE_URL не перекрывают.
        if self.pg_host and url in ("", LOCAL_DATABASE_URL):
            user = quote(self.pg_user, safe="")
            password = quote(self.pg_password, safe="")
            url = (
                f"postgresql+asyncpg://{user}:{password}"
                f"@{self.pg_host}:{self.pg_port}/{quote(self.pg_database, safe='')}"
            )

        if not url:
            raise ValueError(
                "DATABASE_URL пуста. На Railway это обычно значит, что ссылка "
                "${{Сервис.ПЕРЕМЕННАЯ}} не разрешилась: такой переменной у сервиса "
                "базы нет. Либо задайте PGHOST/PGUSER/PGPASSWORD/PGDATABASE."
            )
        if "${{" in url or "}}" in url:
            raise ValueError(
                "DATABASE_URL содержит неподставленную ссылку Railway "
                f"({mask_password(url)}). Переменной с таким именем у сервиса нет."
            )

        url = _to_asyncpg(url)
        try:
            make_url(url)
        except ArgumentError:
            # Пароль замаскирован, поэтому строку безопасно показать: без неё
            # причину не найти, а «Could not parse SQLAlchemy URL» ничего не говорит.
            raise ValueError(
                f"DATABASE_URL не разбирается как строка подключения: {mask_password(url)}. "
                "Ожидается вид postgresql://пользователь:пароль@хост:5432/база"
            ) from None

        object.__setattr__(self, "database_url", url)
        return self

    @property
    def sync_database_url(self) -> str:
        """Синхронный URL для Alembic и скриптов (psycopg вместо asyncpg)."""
        return self.database_url.replace("+asyncpg", "+psycopg")


def format_settings_error(error: ValidationError) -> str:
    """Короткое объяснение вместо трейсбека pydantic.

    Значения полей не печатаем: в DATABASE_URL пароль от базы, а лог
    платформы виден посторонним. pydantic кладёт отвергнутое значение
    в сам ValidationError, поэтому наружу отдаём только сообщения.
    """
    lines = ["ОШИБКА КОНФИГУРАЦИИ: backend не может стартовать."]
    for item in error.errors():
        field = ".".join(str(part) for part in item["loc"]) or "настройки"
        lines.append(f"  {field}: {item['msg'].removeprefix('Value error, ')}")
    return "\n".join(lines)


@lru_cache
def get_settings() -> Settings:
    return Settings()
