"""Фоновые задания: пока контракты-заглушки."""

from martian_map.worker.celery_app import celery_app


@celery_app.task(name="ingest.download_asset_version", bind=True)
def download_asset_version(self, asset_version_id: int) -> dict:
    raise NotImplementedError("Импорт продуктов ещё не реализован (ТЗ §21.2)")


@celery_app.task(name="routing.compute_route_plan", bind=True)
def compute_route_plan(self, route_plan_id: int) -> dict:
    raise NotImplementedError("Расчёт маршрутов ещё не реализован (ТЗ §26)")
