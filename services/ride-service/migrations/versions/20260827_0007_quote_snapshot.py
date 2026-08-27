"""booking_quote_snapshot

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-27 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Add quote_snapshot column to ride_bookings
    op.add_column('ride_bookings', sa.Column('quote_snapshot', sa.JSON(), nullable=True))

def downgrade() -> None:
    # Drop quote_snapshot column from ride_bookings
    op.drop_column('ride_bookings', 'quote_snapshot')
