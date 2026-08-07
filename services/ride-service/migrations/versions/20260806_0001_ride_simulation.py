"""Create Ride simulation quote, booking, confirmation, and idempotency tables."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260806_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ride_quotes",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("actor_id", sa.String(length=128), nullable=False),
        sa.Column("pickup_address", sa.Text(), nullable=False),
        sa.Column("dropoff_address", sa.Text(), nullable=False),
        sa.Column("vehicle_type", sa.String(length=16), nullable=False),
        sa.Column("distance_km", sa.Integer(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("base_fee", sa.Integer(), nullable=False),
        sa.Column("distance_fee", sa.Integer(), nullable=False),
        sa.Column("time_fee", sa.Integer(), nullable=False),
        sa.Column("peak_surcharge", sa.Integer(), nullable=False),
        sa.Column("discount", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("tariff_version", sa.String(length=40), nullable=False),
        sa.Column("quote_version", sa.String(length=96), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("quote_version"),
    )
    op.create_index("ix_ride_quotes_actor_id", "ride_quotes", ["actor_id"])

    op.create_table(
        "ride_bookings",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("actor_id", sa.String(length=128), nullable=False),
        sa.Column("quote_id", sa.String(length=40), nullable=False),
        sa.Column("quote_version", sa.String(length=96), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("status", sa.String(length=48), nullable=False),
        sa.Column("resource_version", sa.Integer(), nullable=False),
        sa.Column("payment_reference", sa.String(length=128), nullable=True),
        sa.Column("driver", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["quote_id"], ["ride_quotes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ride_bookings_actor_id", "ride_bookings", ["actor_id"])
    op.create_index("ix_ride_bookings_quote_id", "ride_bookings", ["quote_id"])
    op.create_index("ix_ride_bookings_status", "ride_bookings", ["status"])

    op.create_table(
        "ride_confirmation_consumptions",
        sa.Column("confirmation_id", sa.String(length=128), nullable=False),
        sa.Column("actor_id", sa.String(length=128), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("confirmation_id"),
    )
    op.create_index(
        "ix_ride_confirmation_consumptions_actor_id",
        "ride_confirmation_consumptions",
        ["actor_id"],
    )

    op.create_table(
        "ride_idempotency_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("actor_id", sa.String(length=128), nullable=False),
        sa.Column("operation", sa.String(length=64), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("response_payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "actor_id",
            "operation",
            "idempotency_key",
            name="uq_ride_idempotency_scope",
        ),
    )
    op.create_index(
        "ix_ride_idempotency_records_actor_id",
        "ride_idempotency_records",
        ["actor_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_ride_idempotency_records_actor_id", table_name="ride_idempotency_records")
    op.drop_table("ride_idempotency_records")
    op.drop_index(
        "ix_ride_confirmation_consumptions_actor_id",
        table_name="ride_confirmation_consumptions",
    )
    op.drop_table("ride_confirmation_consumptions")
    op.drop_index("ix_ride_bookings_status", table_name="ride_bookings")
    op.drop_index("ix_ride_bookings_quote_id", table_name="ride_bookings")
    op.drop_index("ix_ride_bookings_actor_id", table_name="ride_bookings")
    op.drop_table("ride_bookings")
    op.drop_index("ix_ride_quotes_actor_id", table_name="ride_quotes")
    op.drop_table("ride_quotes")
