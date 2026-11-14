"""Research datasets, intake provenance and idempotent observation keys.

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

from martian_map.modules.science.models import ResearchImportFile, ResearchStudy

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    # 0001 uses live metadata.create_all, so a fresh DB may already have these.
    ResearchStudy.__table__.create(bind, checkfirst=True)
    ResearchImportFile.__table__.create(bind, checkfirst=True)
    columns = {c["name"] for c in sa.inspect(bind).get_columns("observation")}
    if "study_id" not in columns:
        op.add_column("observation", sa.Column("study_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_observation_study", "observation", "research_study", ["study_id"], ["id"]
        )
        op.create_index("ix_observation_study_id", "observation", ["study_id"])
    if "import_key" not in columns:
        op.add_column("observation", sa.Column("import_key", sa.String(200), nullable=True))
        op.create_unique_constraint("observation_import_key_key", "observation", ["import_key"])


def downgrade() -> None:
    op.drop_column("observation", "import_key")
    op.drop_column("observation", "study_id")
    op.drop_table("research_import_file")
    op.drop_table("research_study")
