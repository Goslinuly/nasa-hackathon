"""Первая миграция: PostGIS, марсианский SRID и базовая схема каталога."""

from alembic import op

from martian_map.infrastructure.db import Base
from martian_map.modules import all_models  # noqa: F401
from martian_map.modules.coordinates import MARS_SRID

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

_MARS_PROJ4 = "+proj=longlat +R=3396190 +no_defs +type=crs"
_MARS_WKT = (
    'GEOGCS["Mars 2000 (planetocentric, east)",'
    'DATUM["D_Mars_2000_Sphere",SPHEROID["Mars_2000_Sphere",3396190,0]],'
    'PRIMEM["Reference_Meridian",0],UNIT["degree",0.0174532925199433]]'
)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute(
        f"""
        INSERT INTO spatial_ref_sys (srid, auth_name, auth_srid, srtext, proj4text)
        SELECT {MARS_SRID}, 'MARTIAN_MAP', {MARS_SRID}, '{_MARS_WKT}', '{_MARS_PROJ4}'
        WHERE NOT EXISTS (SELECT 1 FROM spatial_ref_sys WHERE srid = {MARS_SRID})
        """
    )
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
    op.execute(f"DELETE FROM spatial_ref_sys WHERE srid = {MARS_SRID}")
