"""Bind passenger count and capacity policy snapshots to Ride transactions."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260816_0006"
down_revision: str | None = "20260814_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ride_quotes",
        sa.Column("passenger_count", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "ride_quotes",
        sa.Column(
            "capacity_policy_version",
            sa.String(length=40),
            nullable=False,
            server_default="ride-capacity-v1",
        ),
    )
    op.create_check_constraint(
        "ck_ride_quotes_passenger_count",
        "ride_quotes",
        "passenger_count BETWEEN 1 AND 20",
    )

    op.add_column(
        "ride_bookings",
        sa.Column("passenger_count", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "ride_bookings",
        sa.Column(
            "capacity_policy_version",
            sa.String(length=40),
            nullable=False,
            server_default="ride-capacity-v1",
        ),
    )
    op.create_check_constraint(
        "ck_ride_bookings_passenger_count",
        "ride_bookings",
        "passenger_count BETWEEN 1 AND 20",
    )


def downgrade() -> None:
    op.drop_constraint("ck_ride_bookings_passenger_count", "ride_bookings", type_="check")
    op.drop_column("ride_bookings", "capacity_policy_version")
    op.drop_column("ride_bookings", "passenger_count")
    op.drop_constraint("ck_ride_quotes_passenger_count", "ride_quotes", type_="check")
    op.drop_column("ride_quotes", "capacity_policy_version")
    op.drop_column("ride_quotes", "passenger_count")
