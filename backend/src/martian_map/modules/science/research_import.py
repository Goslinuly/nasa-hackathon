"""Transactional, repeatable ingestion into PostgreSQL, preserving source status."""

import hashlib

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from martian_map.modules.catalog.models import Source
from martian_map.modules.science.models import Observation, ResearchImportFile, ResearchStudy
from martian_map.modules.science.rad import RadObservation, validate_observations
from martian_map.modules.science.research import ResearchInput


async def source_id(session: AsyncSession) -> int:
    statement = insert(Source).values(
        slug="team-research-imports",
        organization="Martian Map team",
        title="Исследовательские материалы команды",
        notes="Первичные источники и пространственная привязка проверяются для каждого набора.",
    )
    await session.execute(statement.on_conflict_do_nothing(index_elements=[Source.slug]))
    return await session.scalar(select(Source.id).where(Source.slug == "team-research-imports"))


async def import_rad_database(session: AsyncSession, dataset: dict, intake: dict) -> dict:
    rows = validate_observations(
        [RadObservation.model_validate(r) for r in dataset["observations"]]
    )
    source = await source_id(session)
    external_id = dataset["dataset_id"]
    await session.execute(
        insert(ResearchStudy)
        .values(
            external_id=external_id,
            source_id=source,
            title=f"MSL RAD: архивные измерения, sol {rows[0].sol}",
            summary=f"{len(rows)} наблюдений, каналы B и E. Требуется привязка координат "
            "из первичного продукта; это не отдельные места исследования.",
            mission="MSL",
            instrument="RAD",
            verification_status="team_supplied_unverified",
            metadata_json={k: v for k, v in dataset.items() if k != "observations"},
        )
        .on_conflict_do_nothing(index_elements=[ResearchStudy.external_id])
    )
    study = await session.scalar(
        select(ResearchStudy).where(ResearchStudy.external_id == external_id)
    )
    measurements = []
    for row in rows:
        for channel in ("b", "e"):
            measurements.append(
                {
                    "study_id": study.id,
                    "source_id": source,
                    "import_key": f"{external_id}:{row.sol}:{row.observation_id}:{channel}",
                    "mission": "MSL",
                    "instrument": "RAD",
                    "evidence_type": "measurement",
                    "quantity": f"detector_{channel}_dose_rate",
                    "value_num": getattr(row, f"rate_{channel}_microgy_h"),
                    "unit": "microGy/h",
                    "observed_time": row.start_utc,
                    "sol": row.sol,
                    "quality": row.qc,
                    "extra": {
                        "source_row": row.source_row,
                        "observation_id": row.observation_id,
                        "duration_s": row.duration_s,
                        "source_sha256": dataset["source_sha256"],
                    },
                }
            )
    await session.execute(
        insert(Observation)
        .values(measurements)
        .on_conflict_do_nothing(index_elements=[Observation.import_key])
    )
    for file in intake["sources"]:
        key = hashlib.sha256((file["filename"] + file["sha256"]).encode()).hexdigest()
        await session.execute(
            insert(ResearchImportFile)
            .values(
                import_key=key,
                filename=file["filename"],
                sha256=file["sha256"],
                status=file["status"],
                reason=file["reason"],
                study_id=study.id if file.get("dataset_id") == external_id else None,
            )
            .on_conflict_do_nothing(index_elements=[ResearchImportFile.import_key])
        )
    return {
        "study_id": study.id,
        "observations": len(rows),
        "channel_measurements": len(measurements),
        "location_status": "located" if study.latitude_deg is not None else "needs_coordinates",
    }


async def import_research_catalog(session: AsyncSession, records: list[ResearchInput]) -> int:
    source = await source_id(session)
    for record in records:
        values = record.model_dump(exclude={"point", "source_url"})
        values.update(
            source_id=source,
            source_url=str(record.source_url),
            latitude_deg=record.point.latitude_deg if record.point else None,
            longitude_deg=record.point.longitude_deg if record.point else None,
            metadata_json={},
        )
        statement = insert(ResearchStudy).values(**values)
        # An explicit catalog import may supply checked coordinates to an existing RAD dataset.
        updates = {k: v for k, v in values.items() if k not in ("external_id", "metadata_json")}
        await session.execute(
            statement.on_conflict_do_update(
                index_elements=[ResearchStudy.external_id], set_=updates
            )
        )
    return len(records)
