"""Add bounded resolved stopovers to Ride quotes.

Revision ID: 20260828_0008
Revises: 20260827_0007
"""

import sqlalchemy as sa
from alembic import op

revision = "20260828_0008"
down_revision = "20260827_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ride_quotes", sa.Column("stopovers", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("ride_quotes", "stopovers")
