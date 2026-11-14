"""Celery: очередь фоновых заданий (импорт геоданных, тяжёлые расчёты маршрутов).

Запуск: celery -A martian_map.worker.celery_app worker --loglevel=info
"""

from celery import Celery

from martian_map.config import get_settings

settings = get_settings()

celery_app = Celery(
    "martian_map",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["martian_map.worker.tasks"],
)

celery_app.conf.update(
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Тяжёлые задания обязаны иметь лимит времени (ТЗ §26).
    task_time_limit=60 * 30,
    task_soft_time_limit=60 * 25,
)
