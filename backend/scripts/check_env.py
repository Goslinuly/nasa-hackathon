"""Проверка переменных окружения до миграций.

Без неё пустая DATABASE_URL проявляется как сорок строк трейсбека alembic,
заканчивающихся «Could not parse SQLAlchemy URL from given URL string», —
по ним не видно ни какой переменной не хватает, ни где её задать. Контейнер
при этом уходит в цикл перезапусков, и в логах копятся одинаковые трейсбеки.

Запускается первым в CMD: если конфигурация неверна, стартовать всё равно
нечему, и лучше сказать об этом одной строкой.
"""

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
