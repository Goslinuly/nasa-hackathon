#!/bin/sh
# Запуск API: миграции, идемпотентный сид, затем сервер.
#
# Один и тот же сценарий используют и CMD в Dockerfile, и startCommand в
# railway.json — чтобы «своя команда запуска» в панели платформы не обходила
# проверки и не возвращала старый способ запуска сервера.
set -e

python scripts/check_env.py
alembic upgrade head
python scripts/seed_registry.py

# Сид исследований не блокирует старт: без него пусты только /science/*,
# а карта, покрытие и планировщик работают.
python scripts/seed_research.py \
  || echo "ВНИМАНИЕ: сид исследований не выполнен, /science/* будут пустыми" >&2

# gunicorn, а не uvicorn, и [::] вместо 0.0.0.0: приватная сеть Railway
# работает по IPv6, а healthcheck и публичный домен — по IPv4. uvicorn не
# умеет оба стека (asyncio ставит IPV6_V6ONLY), gunicorn умеет.
# exec — чтобы сервер стал главным процессом и получал сигналы остановки.
exec gunicorn martian_map.api.main:app \
  -k uvicorn_worker.UvicornWorker \
  --bind "[::]:${PORT:-8000}" \
  --workers 2 --timeout 120 --access-logfile -
