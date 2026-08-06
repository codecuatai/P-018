from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class ReservationStatus(str, Enum):
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
    image_url: Optional[str] = None
    description: Optional[str] = None


class TableAvailability(BaseModel):
    restaurant_id: str
    booking_time: str
    party_size: int
    available: bool
    available_tables: int
    message: Optional[str] = None


class Reservation(BaseModel):
    id: str
    reservation_code: str
    user_id: str
    restaurant_id: str
    restaurant_name: str
    party_size: int
    booking_time: str
    status: ReservationStatus = ReservationStatus.CONFIRMED
    special_requests: Optional[str] = None
    idempotency_key: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

