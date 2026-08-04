from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Quote(Base):
    __tablename__ = "quotes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    distance_km: Mapped[int] = mapped_column(Integer)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    weather_surcharge: Mapped[int] = mapped_column(Integer)
    discount: Mapped[int] = mapped_column(Integer)
    amount: Mapped[int] = mapped_column(Integer)
    vehicle_type: Mapped[str] = mapped_column(String(16), default="CAR_4")
    tariff_version: Mapped[str] = mapped_column(String(30), default="MVP_V2")
    quote_source: Mapped[str] = mapped_column(String(20), default="MANUAL")
    distance_meters: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pickup_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    pickup_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    pickup_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    pickup_place_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    dropoff_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    dropoff_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    dropoff_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    dropoff_place_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    weather: Mapped[str] = mapped_column(String(16), default="CLEAR")
    weather_source: Mapped[str] = mapped_column(String(30), default="MANUAL")
    traffic_level: Mapped[str] = mapped_column(String(30), default="FREE_FLOW")
    demand_level: Mapped[str] = mapped_column(String(16), default="NORMAL")
    demand_multiplier_bps: Mapped[int] = mapped_column(Integer, default=10_000)
    base_fee: Mapped[int] = mapped_column(Integer, default=0)
    distance_fee: Mapped[int] = mapped_column(Integer, default=0)
    time_fee: Mapped[int] = mapped_column(Integer, default=0)
    peak_surcharge: Mapped[int] = mapped_column(Integer, default=0)
    demand_surcharge: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Booking(Base):
    __tablename__ = "bookings"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    quote_id: Mapped[str] = mapped_column(String(40), index=True)
    amount: Mapped[int] = mapped_column(Integer)  # estimate shown to the rider
    authorized_amount: Mapped[int] = mapped_column(Integer, default=0)
    final_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="VND")
    scenario: Mapped[str] = mapped_column(String(40))
    payment_method: Mapped[str] = mapped_column(String(60))
    payment_intent_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    driver_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    driver_attempts: Mapped[int] = mapped_column(Integer, default=0)
    driver_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    driver_eta_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    driver_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    driver_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(40), index=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    @property
    def driver(self) -> dict | None:
        from .drivers import get_simulated_driver

        driver = get_simulated_driver(self.driver_id)
        if not driver:
            return None
        driver["status"] = self.driver_status or driver["status"]
        driver["eta_seconds"] = self.driver_eta_seconds
        driver["current_location"] = (
            {"latitude": self.driver_latitude, "longitude": self.driver_longitude}
            if self.driver_latitude is not None and self.driver_longitude is not None
            else None
        )
        return driver


class IdempotencyRecord(Base):
    __tablename__ = "ride_idempotency_records"
    __table_args__ = (UniqueConstraint("operation", "key", name="uq_ride_idempotency"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    operation: Mapped[str] = mapped_column(String(40))
    key: Mapped[str] = mapped_column(String(255))
    booking_id: Mapped[str] = mapped_column(String(40))


class ApiAuditLog(Base):
    __tablename__ = "api_audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[str] = mapped_column(String(40), index=True)
    method: Mapped[str] = mapped_column(String(10))
    path: Mapped[str] = mapped_column(String(255), index=True)
    status_code: Mapped[int] = mapped_column(Integer)
    duration_ms: Mapped[int] = mapped_column(Integer)
    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    request_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
