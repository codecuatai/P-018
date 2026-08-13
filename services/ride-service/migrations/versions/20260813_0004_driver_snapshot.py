"""Persist immutable customer-facing driver data on each booking."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260813_0004"
down_revision: str | None = "20260812_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("ride_bookings", sa.Column("driver_snapshot", sa.JSON(), nullable=True))
    op.execute(sa.text("UPDATE ride_bookings SET driver_snapshot = driver WHERE driver_snapshot IS NULL AND driver IS NOT NULL"))


def downgrade() -> None:
    op.drop_column("ride_bookings", "driver_snapshot")
