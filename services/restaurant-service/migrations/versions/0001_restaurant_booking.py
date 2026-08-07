"""create restaurant booking schema"""
import sqlalchemy as sa
from alembic import op

revision = "0001_restaurant_booking"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("restaurants", sa.Column("id", sa.String(64), primary_key=True), sa.Column("name", sa.String(200), nullable=False), sa.Column("location", sa.String(300), nullable=False), sa.Column("cuisine_type", sa.String(80), nullable=False), sa.Column("budget_range", sa.String(8), nullable=False), sa.Column("rating", sa.Float, nullable=False), sa.Column("timezone", sa.String(64), nullable=False), sa.Column("active", sa.Boolean, nullable=False), sa.Column("description", sa.Text), sa.Column("image_url", sa.String(500)))
    op.create_table("restaurant_tables", sa.Column("id", sa.Integer, primary_key=True), sa.Column("restaurant_id", sa.String(64), sa.ForeignKey("restaurants.id"), nullable=False), sa.Column("table_code", sa.String(64), nullable=False), sa.Column("capacity", sa.Integer, nullable=False), sa.Column("seating_type", sa.String(40), nullable=False), sa.Column("active", sa.Boolean, nullable=False), sa.UniqueConstraint("restaurant_id", "table_code"))
    op.create_index("ix_restaurant_tables_restaurant_id", "restaurant_tables", ["restaurant_id"])
    op.create_table("restaurant_opening_hours", sa.Column("id", sa.Integer, primary_key=True), sa.Column("restaurant_id", sa.String(64), sa.ForeignKey("restaurants.id"), nullable=False), sa.Column("weekday", sa.Integer, nullable=False), sa.Column("opens_at", sa.String(5), nullable=False), sa.Column("closes_at", sa.String(5), nullable=False))
    op.create_table("reservation_holds", sa.Column("id", sa.String(64), primary_key=True), sa.Column("actor_id", sa.String(128), nullable=False), sa.Column("restaurant_id", sa.String(64), sa.ForeignKey("restaurants.id"), nullable=False), sa.Column("table_id", sa.Integer, sa.ForeignKey("restaurant_tables.id"), nullable=False), sa.Column("party_size", sa.Integer, nullable=False), sa.Column("start_at", sa.DateTime(timezone=True), nullable=False), sa.Column("end_at", sa.DateTime(timezone=True), nullable=False), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False), sa.Column("status", sa.String(16), nullable=False), sa.Column("resource_version", sa.Integer, nullable=False), sa.Column("idempotency_key", sa.String(255), nullable=False), sa.Column("request_hash", sa.String(64), nullable=False), sa.UniqueConstraint("actor_id", "idempotency_key"))
    op.create_table("reservations", sa.Column("id", sa.String(64), primary_key=True), sa.Column("reservation_code", sa.String(64), unique=True, nullable=False), sa.Column("actor_id", sa.String(128), nullable=False), sa.Column("restaurant_id", sa.String(64), sa.ForeignKey("restaurants.id"), nullable=False), sa.Column("table_id", sa.Integer, sa.ForeignKey("restaurant_tables.id"), nullable=False), sa.Column("party_size", sa.Integer, nullable=False), sa.Column("start_at", sa.DateTime(timezone=True), nullable=False), sa.Column("end_at", sa.DateTime(timezone=True), nullable=False), sa.Column("status", sa.String(16), nullable=False), sa.Column("special_requests", sa.String(500)), sa.Column("hold_id", sa.String(64)), sa.Column("resource_version", sa.Integer, nullable=False), sa.Column("idempotency_key", sa.String(255), nullable=False), sa.Column("request_hash", sa.String(64), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("actor_id", "idempotency_key"))
    op.create_table("reservation_events", sa.Column("id", sa.Integer, primary_key=True), sa.Column("aggregate_type", sa.String(32), nullable=False), sa.Column("aggregate_id", sa.String(64), nullable=False), sa.Column("event_type", sa.String(32), nullable=False), sa.Column("actor_id", sa.String(128), nullable=False), sa.Column("correlation_id", sa.String(128)), sa.Column("metadata_json", sa.Text, nullable=False), sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False))

def downgrade():
    op.drop_table("reservation_events")
    op.drop_table("reservations")
    op.drop_table("reservation_holds")
    op.drop_table("restaurant_opening_hours")
    op.drop_index("ix_restaurant_tables_restaurant_id", table_name="restaurant_tables")
    op.drop_table("restaurant_tables")
    op.drop_table("restaurants")
