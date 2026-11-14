"""Тесты конфигурации: пустая DATABASE_URL называет себя, а не ломается внутри SQLAlchemy."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from martian_map.config import Settings, mask_password


def _url(value: str) -> str:
    return Settings(database_url=value).database_url


@pytest.mark.parametrize("bad", ["", "   ", "хост:5432/база"])
def test_unusable_database_url_is_named(bad: str) -> None:
    with pytest.raises(ValidationError) as caught:
        Settings(database_url=bad)
    assert "DATABASE_URL" in str(caught.value)


def test_preflight_reports_the_problem_without_leaking_the_password() -> None:
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [sys.executable, "scripts/check_env.py"],
        cwd=root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={
            **os.environ,
            "DATABASE_URL": "martian:s3cret@host:5432/db",
            "PYTHONPATH": str(root / "src"),
            "PYTHONIOENCODING": "utf-8",
        },
    )
    assert result.returncode == 1
    assert "DATABASE_URL" in result.stderr
    assert "s3cret" not in result.stderr


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("postgres://u:p@h:5432/d", "postgresql+asyncpg://u:p@h:5432/d"),
        ("postgresql://u:p@h:5432/d", "postgresql+asyncpg://u:p@h:5432/d"),
        ("postgresql+asyncpg://u:p@h:5432/d", "postgresql+asyncpg://u:p@h:5432/d"),
    ],
)
def test_platform_schemes_are_normalized_to_asyncpg(given: str, expected: str) -> None:
    assert _url(given) == expected


def test_alembic_gets_a_synchronous_driver() -> None:
    settings = Settings(database_url="postgres://u:p@h:5432/d")
    assert settings.sync_database_url == "postgresql+psycopg://u:p@h:5432/d"


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("postgresql://martian:s3cret@host:5432/db", "postgresql://martian:***@host:5432/db"),
        ("martian:s3cret@host:5432/db", "martian:***@host:5432/db"),
        ("postgresql://u:p@ss@host/db", "postgresql://u:***@host/db"),
        ("postgresql://host/db", "postgresql://host/db"),
    ],
)
def test_password_never_survives_masking(given: str, expected: str) -> None:
    assert mask_password(given) == expected


def test_connection_parts_build_a_url_when_the_platform_has_no_database_url() -> None:
    settings = Settings(
        _env_file=None,
        PGHOST="db.railway.internal",
        PGUSER="martian",
        PGPASSWORD="p@ss:word/1",
        PGDATABASE="railway",
    )
    assert settings.database_url == (
        "postgresql+asyncpg://martian:p%40ss%3Aword%2F1@db.railway.internal:5432/railway"
    )


def test_explicit_database_url_wins_over_parts() -> None:
    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgres://u:p@given:5432/d",
        PGHOST="ignored.railway.internal",
    )
    assert "given:5432" in settings.database_url


def test_unresolved_platform_reference_is_called_out() -> None:
    with pytest.raises(ValidationError) as caught:
        Settings(_env_file=None, DATABASE_URL="postgresql://${{db.POSTGRES_USER}}:x@h:5432/d")
    assert "не подставленную" in str(caught.value) or "неподставленную" in str(caught.value)


def test_surrounding_whitespace_does_not_break_the_url() -> None:
    settings = Settings(_env_file=None, DATABASE_URL="  postgres://u:p@h:5432/d\n")
    assert settings.database_url == "postgresql+asyncpg://u:p@h:5432/d"
