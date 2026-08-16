from collections.abc import Generator
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker


class Base(DeclarativeBase):
    pass


class RestaurantRow(Base):
    __tablename__ = "restaurants"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    location: Mapped[str] = mapped_column(String(300), nullable=False)
    cuisine_type: Mapped[str] = mapped_column(String(80), nullable=False)
    budget_range: Mapped[str] = mapped_column(String(8), nullable=False)
    rating: Mapped[float] = mapped_column(nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Ho_Chi_Minh")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    address: Mapped[str | None] = mapped_column(String(500))
    ward: Mapped[str | None] = mapped_column(String(120))
    district: Mapped[str | None] = mapped_column(String(120))
    city: Mapped[str | None] = mapped_column(String(120))
    latitude: Mapped[float | None] = mapped_column(nullable=True)
    longitude: Mapped[float | None] = mapped_column(nullable=True)
    source_name: Mapped[str | None] = mapped_column(String(120))
    source_record_id: Mapped[str | None] = mapped_column(String(255))
    source_url: Mapped[str | None] = mapped_column(String(800))
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dataset_version: Mapped[str | None] = mapped_column(String(120))
    content_hash: Mapped[str | None] = mapped_column(String(64))
    coordinate_status: Mapped[str | None] = mapped_column(String(32))
    provenance_json: Mapped[str | None] = mapped_column(Text)
    tables: Mapped[list["TableRow"]] = relationship(back_populates="restaurant")


class TableRow(Base):
    __tablename__ = "restaurant_tables"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    table_code: Mapped[str] = mapped_column(String(64), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    seating_type: Mapped[str] = mapped_column(String(40), nullable=False, default="standard")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    restaurant: Mapped[RestaurantRow] = relationship(back_populates="tables")


class OpeningHourRow(Base):
    __tablename__ = "restaurant_opening_hours"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    opens_at: Mapped[str] = mapped_column(String(5), nullable=False)
    closes_at: Mapped[str] = mapped_column(String(5), nullable=False)


class HoldRow(Base):
    __tablename__ = "reservation_holds"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("restaurant_tables.id"), nullable=False, index=True)
    party_size: Mapped[int] = mapped_column(Integer, nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    resource_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)


class ReservationRow(Base):
    __tablename__ = "reservations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    reservation_code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    restaurant_id: Mapped[str] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("restaurant_tables.id"), nullable=False, index=True)
    party_size: Mapped[int] = mapped_column(Integer, nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    special_requests: Mapped[str | None] = mapped_column(String(500))
    hold_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resource_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class EventRow(Base):
    __tablename__ = "reservation_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    aggregate_type: Mapped[str] = mapped_column(String(32), nullable=False)
    aggregate_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False)
    correlation_id: Mapped[str | None] = mapped_column(String(128))
    metadata_json: Mapped[str] = mapped_column(Text, default="{}")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class IdempotencyRecordRow(Base):
    """Immutable lifecycle evidence for a Restaurant side-effect operation."""

    __tablename__ = "restaurant_idempotency_records"
    __table_args__ = (
        UniqueConstraint(
            "actor_id",
            "operation",
            "idempotency_key",
            name="uq_restaurant_idempotency_actor_operation_key",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    operation: Mapped[str] = mapped_column(String(64), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


def build_engine(database_url: str):
    kwargs: dict[str, Any] = {"pool_pre_ping": True, "future": True}
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(normalize_database_url(database_url), **kwargs)


def normalize_database_url(database_url: str) -> str:
    """Use the psycopg v3 dialect declared by this service."""
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgresql+psycopg2://"):
        return database_url.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)
    return database_url


def make_session_factory(database_url: str):
    return sessionmaker(bind=build_engine(database_url), expire_on_commit=False, class_=Session)


def utc_now() -> datetime:
    return datetime.now(UTC)


def session_scope(factory) -> Generator[Session, None, None]:
    session = factory()
    try:
        yield session
    finally:
        session.close()
