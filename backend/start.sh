#!/bin/sh
# Запуск API: проверка окружения, миграции, сид реестра и исследований, затем gunicorn.
set -e

python scripts/check_env.py
alembic upgrade head
python scripts/seed_registry.py

python scripts/seed_research.py \
  || echo "ВНИМАНИЕ: сид исследований не выполнен, /science/* будут пустыми" >&2

exec gunicorn martian_map.api.main:app \
  -k uvicorn_worker.UvicornWorker \
  --bind "[::]:${PORT:-8000}" \
  --workers 2 --timeout 120 --access-logfile -
