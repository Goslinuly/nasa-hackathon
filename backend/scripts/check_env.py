"""Проверка переменных окружения до миграций."""

import sys

from pydantic import ValidationError

from martian_map.config import format_settings_error, get_settings


def main() -> int:
    try:
        get_settings()
    except ValidationError as error:
        print(format_settings_error(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
