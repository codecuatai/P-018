"""Persist normalized provider route geometry for Ride snapshots."""

import sqlalchemy as sa
from alembic import op

revision: str = "20260814_0005"
down_revision: str | None = "20260813_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ride_quotes", sa.Column("route_geometry", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("ride_quotes", "route_geometry")
