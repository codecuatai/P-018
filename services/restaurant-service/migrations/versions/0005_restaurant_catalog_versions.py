"""add restaurant catalog dataset version registry"""

import sqlalchemy as sa
from alembic import op

revision = "0005_restaurant_versions"
down_revision = "0004_restaurant_catalog"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "catalog_dataset_versions",
        sa.Column("dataset_version", sa.Text(), primary_key=True),
        sa.Column("domain", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("source_manifest", sa.JSON(), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("status", sa.String(16), nullable=False),
        sa.CheckConstraint("domain = 'restaurant'", name="catalog_dataset_versions_domain_check"),
        sa.CheckConstraint("status IN ('VALIDATED', 'IMPORTED', 'PARTIAL', 'DEACTIVATED')", name="catalog_dataset_versions_status_check"),
    )


def downgrade() -> None:
    op.drop_table("catalog_dataset_versions")
