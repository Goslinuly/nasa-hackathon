# Конфигурация через переменные окружения MARTIAN_ и сборка URL базы данных.
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from pydantic import AliasChoices, Field, ValidationError, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

LOCAL_DATABASE_URL = "postgresql+asyncpg://martian:martian@localhost:5433/martian_map"


def mask_password(url: str) -> str:
    prefix, separator, rest = url.partition("//")
    if not separator:
        prefix, rest = "", url
    authority, at_sign, tail = rest.rpartition("@")
    if not at_sign:
        return url
    user, colon, _ = authority.partition(":")
    if not colon:
        return url
    return f"{prefix}{separator}{user}:***{at_sign}{tail}"


def _to_asyncpg(url: str) -> str:
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="MARTIAN_", extra="ignore")

    env: str = "dev"
    science_data_dir: Path = Path(__file__).resolve().parents[2] / "data" / "science"
    database_url: str = Field(
        default=LOCAL_DATABASE_URL,
        validation_alias=AliasChoices("MARTIAN_DATABASE_URL", "DATABASE_URL"),
    )

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
            raise ValueError(
                f"DATABASE_URL не разбирается как строка подключения: {mask_password(url)}. "
                "Ожидается вид postgresql://пользователь:пароль@хост:5432/база"
            ) from None

        object.__setattr__(self, "database_url", url)
        return self

    @property
    def sync_database_url(self) -> str:
        return self.database_url.replace("+asyncpg", "+psycopg")


def format_settings_error(error: ValidationError) -> str:
    lines = ["ОШИБКА КОНФИГУРАЦИИ: backend не может стартовать."]
    for item in error.errors():
        field = ".".join(str(part) for part in item["loc"]) or "настройки"
        lines.append(f"  {field}: {item['msg'].removeprefix('Value error, ')}")
    return "\n".join(lines)


@lru_cache
def get_settings() -> Settings:
    return Settings()
