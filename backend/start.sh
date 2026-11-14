#!/bin/sh
# Запуск API: проверка окружения, миграции, сид реестра и исследований, затем gunicorn.
set -e

python scripts/check_env.py
alembic upgrade head
python scripts/seed_registry.py

python scripts/seed_research.py \
  || echo "ВНИМАНИЕ: сид исследований не выполнен, /science/* будут пустыми" >&2

# [::] в Linux принимает и IPv6, и IPv4: приватная сеть Railway ходит по IPv6,
# healthcheck и публичный домен — по IPv4. Поэтому gunicorn, а не uvicorn (тот ставит V6ONLY).
exec gunicorn martian_map.api.main:app \
  -k uvicorn_worker.UvicornWorker \
  --bind "[::]:${PORT:-8000}" \
  --workers 2 --timeout 120 --access-logfile -
