from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class QuoteCreate(StrictModel):
    pickup_address: str = Field(min_length=3, max_length=300)
    dropoff_address: str = Field(min_length=3, max_length=300)
    vehicle_type: Literal["BIKE", "CAR_4", "CAR_7"] = "CAR_4"
    promo_code: str | None = Field(default=None, min_length=1, max_length=50)
    pickup_time: datetime | None = None


class ConfirmationRequest(StrictModel):
    confirmation_id: str = Field(min_length=1, max_length=128)
    actor_id: str = Field(min_length=1, max_length=128)
    action: str = Field(min_length=1, max_length=64)
    payload_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    quote_version: str = Field(min_length=1, max_length=96)
    amount: int = Field(ge=0)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    issued_at: datetime
    expires_at: datetime


class PrepareBookingRequest(StrictModel):
    quote_id: str = Field(min_length=1, max_length=40)
    confirmation: ConfirmationRequest


class ConfirmBookingRequest(StrictModel):
    payment_reference: str = Field(min_length=1, max_length=128)
    confirmation: ConfirmationRequest


class CancelBookingRequest(StrictModel):
    confirmation: ConfirmationRequest


class QuoteOut(StrictModel):
    id: str
    actor_id: str
    pickup_address: str
    dropoff_address: str
    vehicle_type: str
    distance_km: int
    duration_minutes: int
    base_fee: int
    distance_fee: int
    time_fee: int
    peak_surcharge: int
    discount: int
    amount: int
    currency: str
    tariff_version: str
    quote_version: str
    expires_at: datetime
    created_at: datetime


class BookingOut(StrictModel):
    id: str
    actor_id: str
    quote_id: str
    quote_version: str
    amount: int
    currency: str
    status: str
    resource_version: int
    payment_reference: str | None
    driver: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class ResponseMeta(StrictModel):
    request_id: str
    timestamp: datetime


class QuoteEnvelope(StrictModel):
    data: QuoteOut
    meta: ResponseMeta


class BookingEnvelope(StrictModel):
    data: BookingOut
    meta: ResponseMeta
