"""Чтение каталога: районы и версии продуктов."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from martian_map.modules.catalog.models import Asset, AssetVersion, Region
from martian_map.modules.catalog.schemas import ProductOut, RegionOut


async def list_regions(session: AsyncSession) -> list[RegionOut]:
    regions = (await session.execute(select(Region).order_by(Region.slug))).scalars().all()
    return [
        RegionOut(
            slug=r.slug,
            name_ru=r.name_ru,
            name_en=r.name_en,
            description=r.description,
            coverage_status=r.coverage_status,
            bounds_verified=r.bounds is not None,
        )
        for r in regions
    ]


async def list_products(
    session: AsyncSession,
    region_slug: str | None = None,
    kind: str | None = None,
) -> list[ProductOut]:
    query = (
        select(AssetVersion, Asset, Region)
        .join(Asset, AssetVersion.asset_id == Asset.id)
        .outerjoin(Region, Asset.region_id == Region.id)
        .order_by(AssetVersion.product_id)
    )
    if region_slug:
        query = query.where(Region.slug == region_slug)
    if kind:
        query = query.where(Asset.kind == kind)

    rows = (await session.execute(query)).all()
    return [
        ProductOut(
            product_id=version.product_id,
            title=asset.title,
            kind=asset.kind,
            mission=asset.mission,
            instrument=asset.instrument,
            region_slug=region.slug if region else None,
            url=version.url,
            size_mb=version.size_mb,
            resolution_m=version.resolution_m,
            coverage_area_km2=version.coverage_area_km2,
            nodata_fraction=version.nodata_fraction,
            nodata_value=version.nodata_value,
            height_min_m=version.height_min_m,
            height_max_m=version.height_max_m,
            registration_error_m=version.registration_error_m,
            ortho_count=version.ortho_count,
            license=version.license,
            credit=version.credit,
            verification_status=version.verification_status,
            verification_notes=version.verification_notes,
            registered_at=version.registered_at,
        )
        for version, asset, region in rows
    ]
