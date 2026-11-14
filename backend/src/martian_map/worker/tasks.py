"""Фоновые задания. Пока — контракты-заглушки; реализация по ТЗ §21 и §26.

Правила: идемпотентность по ключу задания, журнал этапов в ingest_job,
лимиты времени/памяти, частичные файлы не публикуются.
"""

from martian_map.worker.celery_app import celery_app


@celery_app.task(name="ingest.download_asset_version", bind=True)
def download_asset_version(self, asset_version_id: int) -> dict:
    """Скачивание исходного продукта в объектное хранилище + SHA-256.

    TODO(ingest): реализация по ТЗ §21.2 — сохранить оригинал без изменения,
    label/STAC item, checksum; повторная загрузка той же версии идемпотентна.
    """
    raise NotImplementedError("Импорт продуктов ещё не реализован (ТЗ §21.2)")


@celery_app.task(name="routing.compute_route_plan", bind=True)
def compute_route_plan(self, route_plan_id: int) -> dict:
    """Расчёт пользовательского маршрута: обзорный коридор + локальное уточнение.

    TODO(routing): реализация по ТЗ §26 — многоуровневая сетка MOLA, затем
    cost-grid внутри опубликованных локальных пакетов; статусы по сегментам.
    """
    raise NotImplementedError("Расчёт маршрутов ещё не реализован (ТЗ §26)")
