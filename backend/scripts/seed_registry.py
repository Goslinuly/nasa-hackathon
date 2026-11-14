"""Загрузка реестра продуктов (data/product_registry.json) в каталог.

Идемпотентно: повторный запуск той же версии реестра не создаёт дубликатов
(ключ — product_id + version_label). Footprint-геометрии реестр не содержит,
поэтому coverage_footprint не заполняется — контуры придут из STAC на этапе
metadata_verified → downloaded и далее.

Запуск (из каталога backend, после `alembic upgrade head`):
    python scripts/seed_registry.py
"""

import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from martian_map.infrastructure.db import get_session_factory  # noqa: E402
from martian_map.modules.catalog.models import (  # noqa: E402
    Asset,
    AssetVersion,
    Region,
    Source,
)

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "product_registry.json"
EXPECTED_DTM_COUNT = 37


async def _get_or_create_source(session: AsyncSession, spec: dict) -> Source:
    source = (
        await session.execute(select(Source).where(Source.slug == spec["slug"]))
    ).scalar_one_or_none()
    if source is None:
        source = Source(
            slug=spec["slug"],
            organization=spec["organization"],
            title=spec["title"],
            url=spec.get("url"),
            usage_terms_url=spec.get("usage_terms_url"),
            credit=spec.get("credit"),
        )
        session.add(source)
        await session.flush()
    return source


async def _get_or_create_region(session: AsyncSession, spec: dict) -> Region:
    region = (
        await session.execute(select(Region).where(Region.slug == spec["slug"]))
    ).scalar_one_or_none()
    if region is None:
        region = Region(
            slug=spec["slug"],
            name_ru=spec["name_ru"],
            name_en=spec["name_en"],
            description=spec.get("description"),
            extra={"hirise_images": spec.get("hirise_images")},
        )
        session.add(region)
        await session.flush()
    return region


async def _upsert_version(
    session: AsyncSession,
    asset: Asset,
    product_id: str,
    defaults: dict,
    **fields,
) -> bool:
    existing = (
        await session.execute(
            select(AssetVersion).where(
                AssetVersion.asset_id == asset.id,
                AssetVersion.product_id == product_id,
                AssetVersion.version_label == "v1",
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return False
    session.add(
        AssetVersion(
            asset_id=asset.id,
            product_id=product_id,
            version_label="v1",
            latitude_type=defaults["latitude_type"],
            **fields,
        )
    )
    return True


async def seed() -> None:
    registry = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    defaults = registry["defaults"]

    dtm_total = sum(len(r["dtms"]) for r in registry["regions"])
    if dtm_total != EXPECTED_DTM_COUNT:
        raise SystemExit(
            f"В реестре {dtm_total} DTM, ожидалось {EXPECTED_DTM_COUNT}: "
            "проверьте data/product_registry.json перед загрузкой."
        )

    async with get_session_factory()() as session:
        sources = {
            spec["slug"]: await _get_or_create_source(session, spec)
            for spec in registry["sources"]
        }

        created = 0
        for spec in registry["global_candidates"]:
            source = sources[spec["source_slug"]]
            asset = (
                await session.execute(
                    select(Asset).where(
                        Asset.source_id == source.id, Asset.title == spec["title"]
                    )
                )
            ).scalar_one_or_none()
            if asset is None:
                asset = Asset(
                    source_id=source.id,
                    kind=spec["kind"],
                    title=spec["title"],
                    mission=spec.get("mission"),
                    instrument=spec.get("instrument"),
                )
                session.add(asset)
                await session.flush()
            created += await _upsert_version(
                session,
                asset,
                spec["product_id"],
                defaults,
                url=spec.get("url"),
                resolution_m=spec.get("resolution_m"),
                registration_error_m=spec.get("registration_error_m"),
                license=spec.get("license"),
                credit=spec.get("credit"),
                verification_status=spec["verification_status"],
                verification_notes=spec.get("notes"),
            )

        stac_source = sources["usgs-astrogeology-stac"]
        for region_spec in registry["regions"]:
            region = await _get_or_create_region(session, region_spec)
            for dtm in region_spec["dtms"]:
                asset = (
                    await session.execute(
                        select(Asset).where(
                            Asset.source_id == stac_source.id,
                            Asset.region_id == region.id,
                            Asset.title == dtm["product_id"],
                        )
                    )
                ).scalar_one_or_none()
                if asset is None:
                    asset = Asset(
                        source_id=stac_source.id,
                        region_id=region.id,
                        kind="dtm",
                        title=dtm["product_id"],
                        mission=defaults["mission"],
                        instrument=defaults["instrument"],
                    )
                    session.add(asset)
                    await session.flush()
                created += await _upsert_version(
                    session,
                    asset,
                    dtm["product_id"],
                    defaults,
                    url=dtm["dtm_url"],
                    size_mb=dtm.get("size_mb"),
                    resolution_m=dtm.get("resolution_m"),
                    coverage_area_km2=dtm.get("coverage_km2"),
                    nodata_fraction=(
                        dtm["nodata_pct"] / 100.0 if dtm.get("nodata_pct") is not None else None
                    ),
                    nodata_value=defaults["nodata_value"],
                    height_min_m=dtm.get("height_min_m"),
                    height_max_m=dtm.get("height_max_m"),
                    ortho_count=dtm.get("ortho_count"),
                    license=defaults["license"],
                    credit=defaults["credit"],
                    verification_status=dtm.get(
                        "verification_status", defaults["verification_status"]
                    ),
                    verification_notes=dtm.get("verification_notes"),
                    extra={"ortho_example_url": dtm.get("ortho_example_url")},
                )

        await session.commit()
        print(f"Готово: добавлено версий продуктов: {created} (повторные пропущены).")


if __name__ == "__main__":
    asyncio.run(seed())
