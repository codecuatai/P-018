"""add restaurant catalog provenance and geo quality"""

import sqlalchemy as sa
from alembic import op

revision = "0004_restaurant_catalog"
down_revision = "0003_restaurant_legacy_backfill"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name, column in [
        ("address", sa.String(500)), ("ward", sa.String(120)), ("district", sa.String(120)), ("city", sa.String(120)),
        ("latitude", sa.Float()), ("longitude", sa.Float()), ("source_name", sa.String(120)), ("source_record_id", sa.String(255)),
        ("source_url", sa.String(800)), ("fetched_at", sa.DateTime(timezone=True)), ("last_verified_at", sa.DateTime(timezone=True)),
        ("dataset_version", sa.String(120)), ("content_hash", sa.String(64)), ("coordinate_status", sa.String(32)), ("provenance_json", sa.Text()),
    ]:
        op.add_column("restaurants", sa.Column(name, column, nullable=True))
    op.create_unique_constraint("uq_restaurants_source_record_id", "restaurants", ["source_name", "source_record_id"])
    op.create_index("ix_restaurants_dataset_version", "restaurants", ["dataset_version"])
    op.create_index("ix_restaurants_geo_quality", "restaurants", ["coordinate_status", "active"])


def downgrade() -> None:
    op.drop_index("ix_restaurants_geo_quality", table_name="restaurants")
    op.drop_index("ix_restaurants_dataset_version", table_name="restaurants")
    op.drop_constraint("uq_restaurants_source_record_id", "restaurants", type_="unique")
    for name in ["provenance_json", "coordinate_status", "content_hash", "dataset_version", "last_verified_at", "fetched_at", "source_url", "source_record_id", "source_name", "longitude", "latitude", "city", "district", "ward", "address"]:
        op.drop_column("restaurants", name)
