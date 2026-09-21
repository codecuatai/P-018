"""Add deterministic Ride V2 route snapshots, tariffs, drivers, and tracking evidence."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260812_0002"
down_revision: str | None = "20260806_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for name, column in (
        ("pickup_latitude", sa.Column("pickup_latitude", sa.Numeric(9, 6), nullable=True)),
        ("pickup_longitude", sa.Column("pickup_longitude", sa.Numeric(9, 6), nullable=True)),
        ("dropoff_latitude", sa.Column("dropoff_latitude", sa.Numeric(9, 6), nullable=True)),
        ("dropoff_longitude", sa.Column("dropoff_longitude", sa.Numeric(9, 6), nullable=True)),
        ("route_provider", sa.Column("route_provider", sa.String(length=80), nullable=False, server_default="deterministic-address-hash")),
        ("route_distance_meters", sa.Column("route_distance_meters", sa.Integer(), nullable=True)),
        ("route_duration_seconds", sa.Column("route_duration_seconds", sa.Integer(), nullable=True)),
        ("route_polyline", sa.Column("route_polyline", sa.Text(), nullable=True)),
        ("route_snapshot_hash", sa.Column("route_snapshot_hash", sa.String(length=64), nullable=True)),
        ("tariff_snapshot", sa.Column("tariff_snapshot", sa.JSON(), nullable=True)),
    ):
        op.add_column("ride_quotes", column)
    for name, column in (
        ("driver_id", sa.Column("driver_id", sa.String(length=128), nullable=True)),
        ("tracking_started_at", sa.Column("tracking_started_at", sa.DateTime(timezone=True), nullable=True)),
    ):
        op.add_column("ride_bookings", column)

    op.create_table(
        "ride_tariffs",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("vehicle_type", sa.String(length=16), nullable=False),
        sa.Column("version", sa.String(length=40), nullable=False),
        sa.Column("base_fee", sa.Integer(), nullable=False),
        sa.Column("per_km", sa.Integer(), nullable=False),
        sa.Column("per_minute", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("vehicle_type", "version", name="uq_ride_tariffs_vehicle_version"),
    )
    op.create_table(
        "ride_drivers",
        sa.Column("id", sa.String(length=128), primary_key=True),
        sa.Column("display_name", sa.String(length=160), nullable=False),
        sa.Column("vehicle_type", sa.String(length=16), nullable=False),
        sa.Column("vehicle_model", sa.String(length=120), nullable=False),
        sa.Column("vehicle_color", sa.String(length=60), nullable=False),
        sa.Column("license_plate", sa.String(length=32), nullable=False),
        sa.Column("phone_masked", sa.String(length=32), nullable=False),
        sa.Column("rating", sa.Numeric(3, 2), nullable=False),
        sa.Column("latitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("longitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("vehicle", sa.JSON(), nullable=False),
        sa.Column("availability_status", sa.String(length=32), nullable=False, server_default="AVAILABLE"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.execute(sa.text("""
        INSERT INTO ride_tariffs (id, vehicle_type, version, base_fee, per_km, per_minute)
        VALUES
          ('tariff_sim_bike_v1', 'BIKE', 'SIM_2026_08_V1', 8000, 5000, 700),
          ('tariff_sim_car4_v1', 'CAR_4', 'SIM_2026_08_V1', 10000, 7000, 1000),
          ('tariff_sim_car7_v1', 'CAR_7', 'SIM_2026_08_V1', 15000, 9000, 1300)
        ON CONFLICT (vehicle_type, version) DO NOTHING
    """))
    op.execute(sa.text("""
        INSERT INTO ride_drivers (id, display_name, vehicle_type, vehicle_model, vehicle_color, license_plate, phone_masked, rating, latitude, longitude, vehicle)
        VALUES
          ('driver_simulated_bike_001', 'Quang Huy', 'BIKE', 'Wave RSX', 'Den', '29K1-390.80', '*** *** 3908', 4.90, 21.0285, 105.8048, '{"type":"BIKE","make":"Honda","model":"Wave RSX","license_plate":"29K1-390.80"}'),
          ('driver_simulated_001', 'Minh Anh', 'CAR_4', 'Vios', 'Trang', '30H-482.19', '*** *** 4821', 4.90, 21.0301, 105.8122, '{"type":"CAR_4","make":"Toyota","model":"Vios","license_plate":"30H-482.19"}'),
          ('driver_simulated_car7_001', 'Duc Long', 'CAR_7', 'Xpander', 'Bac', '30G-552.07', '*** *** 5520', 4.90, 21.0186, 105.8230, '{"type":"CAR_7","make":"Mitsubishi","model":"Xpander","license_plate":"30G-552.07"}')
        ON CONFLICT (id) DO NOTHING
    """))

    op.create_table(
        "ride_tracking_events",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("booking_id", sa.String(length=40), sa.ForeignKey("ride_bookings.id"), nullable=False),
        sa.Column("status", sa.String(length=48), nullable=False),
        sa.Column("progress", sa.Numeric(6, 4), nullable=False),
        sa.Column("current_location", sa.JSON(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_ride_tracking_events_booking_id", "ride_tracking_events", ["booking_id", "occurred_at"])


def downgrade() -> None:
    op.drop_index("ix_ride_tracking_events_booking_id", table_name="ride_tracking_events")
    op.drop_table("ride_tracking_events")
    op.drop_table("ride_drivers")
    op.drop_table("ride_tariffs")
    op.drop_column("ride_bookings", "tracking_started_at")
    op.drop_column("ride_bookings", "driver_id")
    for name in ("tariff_snapshot", "route_snapshot_hash", "route_polyline", "route_duration_seconds", "route_distance_meters", "route_provider", "dropoff_longitude", "dropoff_latitude", "pickup_longitude", "pickup_latitude"):
        op.drop_column("ride_quotes", name)
