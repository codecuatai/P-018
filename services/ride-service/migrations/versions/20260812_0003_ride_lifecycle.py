"""Add explicit Ride quote and booking lifecycle states."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260812_0003"
down_revision: str | None = "20260812_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ride_quotes",
        sa.Column("status", sa.String(length=40), nullable=False, server_default="QUOTE_CREATED"),
    )

    # Preserve the meaning of rows created by the pre-lifecycle implementation.
    op.execute(
        sa.text(
            """
            UPDATE ride_bookings
            SET status = 'AWAITING_CONFIRMATION'
            WHERE status = 'AWAITING_PAYMENT_CONFIRMATION'
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE ride_quotes
            SET status = 'AWAITING_CONFIRMATION'
            WHERE id IN (
                SELECT quote_id FROM ride_bookings WHERE status = 'AWAITING_CONFIRMATION'
            )
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE ride_quotes
            SET status = 'CONSUMED'
            WHERE id IN (
                SELECT quote_id
                FROM ride_bookings
                WHERE status <> 'AWAITING_CONFIRMATION'
            )
            """
        )
    )
    op.alter_column("ride_quotes", "status", server_default=None)


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE ride_bookings
            SET status = 'AWAITING_PAYMENT_CONFIRMATION'
            WHERE status = 'AWAITING_CONFIRMATION'
            """
        )
    )
    op.drop_column("ride_quotes", "status")
