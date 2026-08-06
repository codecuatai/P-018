from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from src.domain.restaurant import ReservationStatus


class RestaurantResponse(BaseModel):
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


class RestaurantListResponse(BaseModel):
    items: List[RestaurantResponse]
    total: int


class AvailabilityCheckRequest(BaseModel):
    party_size: int = Field(..., gt=0, description="Number of guests")
    booking_time: str = Field(..., description="Desired date and time (ISO format or YYYY-MM-DD HH:MM)")


class AvailabilityCheckResponse(BaseModel):
    restaurant_id: str
    booking_time: str
    party_size: int
    available: bool
    available_tables: int
    message: Optional[str] = None


class ReservationCreateRequest(BaseModel):
    user_id: str = Field(..., description="User ID placing reservation")
    restaurant_id: str = Field(..., description="Restaurant ID")
    party_size: int = Field(..., gt=0, description="Number of guests")
    booking_time: str = Field(..., description="Date and time for table reservation")
    special_requests: Optional[str] = Field(None, description="Special requests (e.g. window seat, quiet table)")
    idempotency_key: Optional[str] = Field(None, description="Idempotency key to prevent duplicate bookings")


class ReservationUpdateRequest(BaseModel):
    party_size: Optional[int] = Field(None, gt=0)
    booking_time: Optional[str] = None
    special_requests: Optional[str] = None


class ReservationResponse(BaseModel):
    id: str
    reservation_code: str
    user_id: str
    restaurant_id: str
    restaurant_name: str
    party_size: int
    booking_time: str
    status: ReservationStatus
    special_requests: Optional[str] = None
    idempotency_key: Optional[str] = None
    created_at: datetime
    updated_at: datetime
