from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class QuoteRow(Base):
    __tablename__ = "ride_quotes"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    actor_id: Mapped[str] = mapped_column(String(128), index=True)
    status: Mapped[str] = mapped_column(String(40), default="QUOTE_CREATED")
    pickup_address: Mapped[str] = mapped_column(Text)
    dropoff_address: Mapped[str] = mapped_column(Text)
    vehicle_type: Mapped[str] = mapped_column(String(16))
    distance_km: Mapped[int] = mapped_column(Integer)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    base_fee: Mapped[int] = mapped_column(Integer)
    distance_fee: Mapped[int] = mapped_column(Integer)
    time_fee: Mapped[int] = mapped_column(Integer)
    peak_surcharge: Mapped[int] = mapped_column(Integer)
    discount: Mapped[int] = mapped_column(Integer)
    amount: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    tariff_version: Mapped[str] = mapped_column(String(40))
    quote_version: Mapped[str] = mapped_column(String(96), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    pickup_latitude: Mapped[float | None] = mapped_column(nullable=True)
    pickup_longitude: Mapped[float | None] = mapped_column(nullable=True)
    dropoff_latitude: Mapped[float | None] = mapped_column(nullable=True)
    dropoff_longitude: Mapped[float | None] = mapped_column(nullable=True)
    route_provider: Mapped[str] = mapped_column(String(80), default="deterministic-address-hash")
    route_distance_meters: Mapped[int | None] = mapped_column(Integer, nullable=True)
    route_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    route_polyline: Mapped[str | None] = mapped_column(Text, nullable=True)
    route_geometry: Mapped[list[dict[str, float]] | None] = mapped_column(JSON, nullable=True)
    route_snapshot_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tariff_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)


class BookingRow(Base):
    __tablename__ = "ride_bookings"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    actor_id: Mapped[str] = mapped_column(String(128), index=True)
    quote_id: Mapped[str] = mapped_column(ForeignKey("ride_quotes.id"), index=True)
    quote_version: Mapped[str] = mapped_column(String(96))
    amount: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[str] = mapped_column(String(48), index=True)
    resource_version: Mapped[int] = mapped_column(Integer)
    payment_reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    driver: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    driver_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    driver_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tracking_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RideTariffRow(Base):
    __tablename__ = "ride_tariffs"
    __table_args__ = (UniqueConstraint("vehicle_type", "version", name="uq_ride_tariffs_vehicle_version"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    vehicle_type: Mapped[str] = mapped_column(String(16))
    version: Mapped[str] = mapped_column(String(40))
    base_fee: Mapped[int] = mapped_column(Integer)
    per_km: Mapped[int] = mapped_column(Integer)
    per_minute: Mapped[int] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RideDriverRow(Base):
    __tablename__ = "ride_drivers"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(160))
    vehicle_type: Mapped[str] = mapped_column(String(16))
    vehicle_model: Mapped[str] = mapped_column(String(120))
    vehicle_color: Mapped[str] = mapped_column(String(60))
    license_plate: Mapped[str] = mapped_column(String(32))
    phone_masked: Mapped[str] = mapped_column(String(32))
    rating: Mapped[float] = mapped_column()
    latitude: Mapped[float] = mapped_column()
    longitude: Mapped[float] = mapped_column()
    vehicle: Mapped[dict[str, Any]] = mapped_column(JSON)
    availability_status: Mapped[str] = mapped_column(String(32), default="AVAILABLE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RideTrackingEventRow(Base):
    __tablename__ = "ride_tracking_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    booking_id: Mapped[str] = mapped_column(ForeignKey("ride_bookings.id"), index=True)
    status: Mapped[str] = mapped_column(String(48))
    progress: Mapped[float] = mapped_column()
    current_location: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class ConfirmationConsumptionRow(Base):
    __tablename__ = "ride_confirmation_consumptions"

    confirmation_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    actor_id: Mapped[str] = mapped_column(String(128), index=True)
    action: Mapped[str] = mapped_column(String(64))
    payload_hash: Mapped[str] = mapped_column(String(64))
    consumed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class IdempotencyRow(Base):
    __tablename__ = "ride_idempotency_records"
    __table_args__ = (
        UniqueConstraint("actor_id", "operation", "idempotency_key", name="uq_ride_idempotency_scope"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[str] = mapped_column(String(128), index=True)
    operation: Mapped[str] = mapped_column(String(64))
    idempotency_key: Mapped[str] = mapped_column(String(128))
    request_hash: Mapped[str] = mapped_column(String(64))
    response_payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
