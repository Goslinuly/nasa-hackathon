"""Оценка покрытия для точки по опубликованным и кандидатным продуктам.

Два источника дают разные половины ответа:

* `product_registry.json` в БД — кандидаты: паспорт продукта проверен, растр не скачан;
* `served_products.json` — то, что лежит в сборке и действительно отдаётся пользователю.

Уровень данных считается по второму списку. Иначе ответ «недостаточно данных» приходит
для всего Марса, в том числе для участков, которые сайт отдаёт в метре на пиксель.
"""

import logging

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
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
    ServedPackageOut,
)
from martian_map.modules.coverage.served import (
    ServedPackage,
    ServedProduct,
    global_products_at,
    package_at,
)

logger = logging.getLogger(__name__)

_GLOBAL_KINDS = ("global_dem", "global_mosaic")

CATALOG_DOWN_RU = "Каталог кандидатов сейчас не отвечает: показаны только продукты сборки."
CATALOG_DOWN_EN = (
    "The candidate catalog is not responding right now: only the products shipped in the "
    "build are shown."
)


def _served_product(product: ServedProduct) -> CoverageProduct:
    return CoverageProduct(
        title=t(product.title.ru, product.title.en),
        product_id=product.product_id,
        kind=product.kind,
        resolution_m=product.resolution_m,
        registration_error_m=None,
        verification_status=product.verification_status,
        license=product.license,
        credit=product.credit,
        note=t(product.note.ru, product.note.en) if product.note else None,
    )


def _package_out(package: ServedPackage) -> ServedPackageOut:
    bounds = package.bounds
    return ServedPackageOut(
        slug=package.slug,
        title=t(package.title.ru, package.title.en),
        walk_url=package.walk_url,
        best_dtm_resolution_m=package.best_resolution_m,
        hirise_fraction=package.hirise_fraction,
        note=t(package.source_mix.ru, package.source_mix.en) if package.source_mix else None,
        bounds=[bounds.west, bounds.south, bounds.east, bounds.north],
    )


def _local_explanation(package: ServedPackage) -> str:
    resolution = package.best_resolution_m
    scale = f"{resolution:g}" if resolution else "—"
    title = t(package.title.ru, package.title.en)
    text = t(
        f"Точка внутри подробного пакета «{title}»: рельеф {scale} м/пикс и ортоизображение "
        "лежат в сборке и открываются в прогулке. "
        "Подробные данные не делают путь проверенной тропой.",
        f"The point is inside the detailed package “{title}”: terrain at {scale} m/px and an "
        "orthoimage are shipped in the build and open in the walk. "
        "Detailed data does not turn a path into a verified trail.",
    )
    if package.source_mix:
        text = f"{text} {t(package.source_mix.ru, package.source_mix.en)}"
    return text


def resolve_data_level(
    package: ServedPackage | None, published_overview: list[CoverageProduct]
) -> tuple[DataLevel, str]:
    """Уровень данных и объяснение: подробный пакет важнее обзора, обзор важнее пустоты."""
    if package and any(product.published for product in package.products):
        return DataLevel.LOCAL_DTM, _local_explanation(package)
    if any(
        product.verification_status == VerificationStatus.PUBLISHED.value
        for product in published_overview
    ):
        return DataLevel.ORBITAL_OVERVIEW, t(
            "Для этой точки есть обзорная основа: рельеф MOLA около 7,4 км на ячейку. "
            "Этого хватает на направление и профиль высот, но не на проходимость: "
            "камни, обрывы и кратеры мельче ячейки в данных отсутствуют.",
            "An overview base is available for this point: MOLA relief at about 7.4 km per cell. "
            "That is enough for a direction and an elevation profile, but not for trafficability: "
            "rocks, scarps and craters smaller than a cell are absent from the data.",
        )
    return DataLevel.UNASSESSED, t(
        "Опубликованных данных для этой точки нет: каталог содержит только "
        "кандидатные продукты (статусы candidate/metadata_verified). "
        "Маршрут в этой точке пока нельзя оценить.",
        "There is no published data for this point: the catalog holds only "
        "candidate products (statuses candidate/metadata_verified). "
        "A route at this point cannot be assessed yet.",
    )


async def _catalog_rows(session: AsyncSession) -> tuple[list, list, bool]:
    """Кандидаты из БД; при недоступной базе — пустые списки и признак отказа.

    Продукты сборки от базы не зависят, поэтому ответ о покрытии остаётся осмысленным
    даже когда каталог не отвечает.
    """
    try:
        overview = (
            await session.execute(
                select(AssetVersion, Asset)
                .join(Asset, AssetVersion.asset_id == Asset.id)
                .where(Asset.kind.in_(_GLOBAL_KINDS))
            )
        ).all()
        regions = (
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
    except (SQLAlchemyError, OSError):
        # OSError ловит и голый ConnectionRefusedError от драйвера, не обёрнутый SQLAlchemy.
        logger.warning("Каталог кандидатов недоступен: покрытие отвечает по продуктам сборки")
        return [], [], False
    return list(overview), list(regions), True


async def assess_point_coverage(session: AsyncSession, point: MarsPoint) -> CoverageResponse:
    overview_rows, region_rows, catalog_ok = await _catalog_rows(session)

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

    package = package_at(point.latitude_deg, point.longitude_deg)
    known_ids = {product.product_id for product in published_overview}
    for served in global_products_at(point.latitude_deg, point.longitude_deg):
        if served.product_id not in known_ids:
            published_overview.append(_served_product(served))

    published_local = [_served_product(product) for product in package.products] if package else []

    data_level, explanation = resolve_data_level(package, published_overview)
    if not catalog_ok:
        explanation = f"{explanation} {t(CATALOG_DOWN_RU, CATALOG_DOWN_EN)}"

    return CoverageResponse(
        point=point,
        data_level=data_level,
        explanation=explanation,
        overview_candidates=overview_candidates,
        published_overview=published_overview,
        local_candidates=local_candidates,
        published_local=published_local,
        local_package=_package_out(package) if package else None,
    )
