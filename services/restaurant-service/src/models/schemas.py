from datetime import datetime

from pydantic import BaseModel, Field


class RestaurantResponse(BaseModel):
    id: str
    name: str
    location: str
    cuisine_type: str
    cuisine_tags: list[str] = Field(default_factory=list)
    budget_range: str
    price_level: str | None = None
    rating: float
    review_count: int | None = None
    timezone: str
    image_url: str | None = None
    description: str | None = None
    address: str | None = None
    ward: str | None = None
    district: str | None = None
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    coordinate_status: str | None = None
    phone: str | None = None
    website: str | None = None
    opening_hours: str | None = None


class RestaurantListResponse(BaseModel):
    items: list[RestaurantResponse]
    total: int


class AvailabilityCheckRequest(BaseModel):
    party_size: int = Field(..., gt=0, description="Number of guests")
    start_at: datetime
    duration_minutes: int = Field(120, ge=30, le=360)
    seating_type: str | None = None


class AvailabilityCheckResponse(BaseModel):
    restaurant_id: str
    start_at: datetime
    end_at: datetime
    party_size: int
    available: bool
    table_code: str | None = None
    resource_version: int = 1
    message: str | None = None


class ReservationCreateRequest(BaseModel):
    restaurant_id: str = Field(..., description="Restaurant ID")
    party_size: int = Field(..., gt=0, description="Number of guests")
    start_at: datetime
    duration_minutes: int = Field(120, ge=30, le=360)
    special_requests: str | None = Field(None, description="Special requests (e.g. window seat, quiet table)")
    hold_id: str | None = None


class ReservationUpdateRequest(BaseModel):
    party_size: int | None = Field(None, gt=0)
    start_at: datetime | None = None
    special_requests: str | None = None


class ReservationResponse(BaseModel):
    id: str
    reservation_code: str
    actor_id: str
    restaurant_id: str
    restaurant_name: str
    party_size: int
    table_code: str
    start_at: datetime
    end_at: datetime
    status: str
    special_requests: str | None = None
    idempotency_key: str | None = None
    created_at: datetime
    updated_at: datetime


class HoldCreateRequest(BaseModel):
    restaurant_id: str
    party_size: int = Field(..., gt=0)
    start_at: datetime
    duration_minutes: int = Field(120, ge=30, le=360)


class HoldResponse(BaseModel):
    id: str
    hold_code: str
    actor_id: str
    restaurant_id: str
    table_code: str | None
    party_size: int
    start_at: datetime
    end_at: datetime
    expires_at: datetime
    status: str
