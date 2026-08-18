"""Persist actor-scoped Restaurant lifecycle idempotency evidence."""

import sqlalchemy as sa
from alembic import op

revision = "0002_restaurant_idempotency"
down_revision = "0001_restaurant_booking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "restaurant_idempotency_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("actor_id", sa.String(length=128), nullable=False),
        sa.Column("operation", sa.String(length=64), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("response_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "actor_id",
            "operation",
            "idempotency_key",
            name="uq_restaurant_idempotency_actor_operation_key",
        ),
    )
    op.create_index(
        "ix_restaurant_idempotency_records_actor_id",
        "restaurant_idempotency_records",
        ["actor_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_restaurant_idempotency_records_actor_id",
        table_name="restaurant_idempotency_records",
    )
    op.drop_table("restaurant_idempotency_records")
