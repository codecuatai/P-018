from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class ReservationStatus(StrEnum):
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    MODIFIED = "MODIFIED"


class Restaurant(BaseModel):
    id: str
    name: str
    location: str
    cuisine_type: str
    budget_range: str
    rating: float
    total_capacity: int
    opening_hours: str
    image_url: str | None = None
    description: str | None = None


class TableAvailability(BaseModel):
    restaurant_id: str
    booking_time: str
    party_size: int
    available: bool
    available_tables: int
    message: str | None = None


class Reservation(BaseModel):
    id: str
    reservation_code: str
    user_id: str
    restaurant_id: str
    restaurant_name: str
    party_size: int
    booking_time: str
    status: ReservationStatus = ReservationStatus.CONFIRMED
    special_requests: str | None = None
    idempotency_key: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

