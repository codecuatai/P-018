"""booking_quote_snapshot

Revision ID: 20260827_0007
Revises: 20260816_0006
Create Date: 2026-08-27 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "20260827_0007"
down_revision = "20260816_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ride_bookings", sa.Column("quote_snapshot", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("ride_bookings", "quote_snapshot")
