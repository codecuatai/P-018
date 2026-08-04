"""Typed boundary models for the Ride Service integration."""

from typing import Literal

from pydantic import BaseModel, Field

VehicleType = Literal["BIKE", "CAR_4", "CAR_7"]
Scenario = Literal["HAPPY_PATH", "DRIVER_CANCEL_ONCE", "NO_DRIVER", "PAYMENT_DECLINED", "CAPTURE_FAILED", "CAPTURE_TIMEOUT_BUT_SUCCEEDED"]


class LiveQuoteRequest(BaseModel):
    pickup_address: str = Field(min_length=3, max_length=300)
    dropoff_address: str = Field(min_length=3, max_length=300)
    vehicle_type: VehicleType = "CAR_4"
    promo_code: str | None = None
    demand_level: Literal["AUTO", "LOW", "NORMAL", "HIGH"] = "AUTO"


class QuoteSummary(BaseModel):
    id: str
    amount: int
    currency: str = "VND"
    vehicle_type: str = "CAR_4"
    distance_km: int | None = None
    duration_minutes: int | None = None
    pickup_address: str | None = None
    dropoff_address: str | None = None


class BookingCreateRequest(BaseModel):
    quote_id: str
    scenario: Scenario = "HAPPY_PATH"


class BookingSummary(BaseModel):
    id: str
    quote_id: str
    amount: int
    authorized_amount: int | None = None
    final_amount: int | None = None
    status: str
    payment_intent_id: str | None = None
    driver_eta_seconds: int | None = None
    last_error: str | None = None
    driver: dict | None = None
