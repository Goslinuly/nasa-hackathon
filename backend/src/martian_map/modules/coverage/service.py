"""Оценка покрытия для точки по опубликованным и кандидатным продуктам."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from martian_map.i18n import t
from martian_map.modules.catalog.models import Asset, AssetVersion, Region
from martian_map.modules.catalog.translations import registry_text
from martian_map.modules.common.enums import DataLevel, VerificationStatus
from martian_map.modules.coordinates import MarsPoint
from martian_map.modules.coverage.schemas import (
    CoverageProduct,
    CoverageResponse,
    RegionCoverageCandidate,
)

_GLOBAL_KINDS = ("global_dem", "global_mosaic")


async def assess_point_coverage(session: AsyncSession, point: MarsPoint) -> CoverageResponse:
    overview_rows = (
        await session.execute(
            select(AssetVersion, Asset)
            .join(Asset, AssetVersion.asset_id == Asset.id)
            .where(Asset.kind.in_(_GLOBAL_KINDS))
        )
    ).all()

    overview_candidates: list[CoverageProduct] = []
    published_overview: list[CoverageProduct] = []
    for version, asset in overview_rows:
        product = CoverageProduct(
            title=registry_text(asset.title),
            product_id=version.product_id,
            kind=asset.kind,
            resolution_m=version.resolution_m,
            registration_error_m=version.registration_error_m,
            verification_status=version.verification_status,
            license=version.license,
            credit=version.credit,
        )
        if version.verification_status == VerificationStatus.PUBLISHED.value:
            published_overview.append(product)
        else:
            overview_candidates.append(product)

    region_rows = (
        await session.execute(
            select(
                Region,
                func.count(AssetVersion.id),
                func.min(AssetVersion.resolution_m),
            )
            .outerjoin(Asset, (Asset.region_id == Region.id) & (Asset.kind == "dtm"))
            .outerjoin(AssetVersion, AssetVersion.asset_id == Asset.id)
            .group_by(Region.id)
            .order_by(Region.slug)
        )
    ).all()

    local_candidates = [
        RegionCoverageCandidate(
            slug=region.slug,
            name_ru=region.name_ru,
            name_en=region.name_en,
            dtm_count=dtm_count or 0,
            best_dtm_resolution_m=best_res,
            footprints_verified=region.bounds is not None,
            verification_status=region.coverage_status,
            note=(
                t(
                    "Границы и валидные маски не проверены; запись означает кандидатные "
                    "продукты в каталоге, а не подтверждённое покрытие этой точки.",
                    "Footprints and valid-data masks are not verified; the entry means "
                    "candidate products in the catalog, not confirmed coverage of this point.",
                )
                if region.bounds is None
                else None
            ),
        )
        for region, dtm_count, best_res in region_rows
    ]

    if published_overview:
        data_level = DataLevel.ORBITAL_OVERVIEW
        explanation = t(
            "Доступна опубликованная обзорная основа. Обзорный уровень не "
            "подтверждает локальную проходимость.",
            "A published overview base is available. The overview level does not "
            "confirm local trafficability.",
        )
    else:
        data_level = DataLevel.UNASSESSED
        explanation = t(
            "Опубликованных данных для этой точки нет: каталог содержит только "
            "кандидатные продукты (статусы candidate/metadata_verified). "
            "Маршрут в этой точке пока нельзя оценить.",
            "There is no published data for this point: the catalog holds only "
            "candidate products (statuses candidate/metadata_verified). "
            "A route at this point cannot be assessed yet.",
        )

    return CoverageResponse(
        point=point,
        data_level=data_level,
        explanation=explanation,
        overview_candidates=overview_candidates,
        published_overview=published_overview,
        local_candidates=local_candidates,
        published_local=[],
    )
