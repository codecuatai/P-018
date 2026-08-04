from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Scenario = Literal[
    "HAPPY_PATH",
    "DRIVER_CANCEL_ONCE",
    "NO_DRIVER",
    "PAYMENT_DECLINED",
    "CAPTURE_FAILED",
    "CAPTURE_TIMEOUT_BUT_SUCCEEDED",
]
VehicleType = Literal["BIKE", "CAR_4", "CAR_7"]
DemandLevel = Literal["AUTO", "LOW", "NORMAL", "HIGH"]


class QuoteCreate(BaseModel):
    distance_km: int = Field(ge=1, le=200)
    duration_minutes: int = Field(ge=1, le=600)
    weather: Literal["CLEAR", "RAIN"] = "CLEAR"
    promo_code: str | None = None
    vehicle_type: VehicleType = "CAR_4"
    demand_level: DemandLevel = "AUTO"
    pickup_time: datetime | None = None


class LiveQuoteCreate(BaseModel):
    pickup_address: str | None = Field(default=None, min_length=3, max_length=300)
    pickup_latitude: float | None = Field(default=None, ge=-90, le=90)
    pickup_longitude: float | None = Field(default=None, ge=-180, le=180)
    pickup_place_id: str | None = Field(default=None, max_length=120)
    dropoff_address: str | None = Field(default=None, min_length=3, max_length=300)
    dropoff_latitude: float | None = Field(default=None, ge=-90, le=90)
    dropoff_longitude: float | None = Field(default=None, ge=-180, le=180)
    dropoff_place_id: str | None = Field(default=None, max_length=120)
    promo_code: str | None = None
    vehicle_type: VehicleType = "CAR_4"
    demand_level: DemandLevel = "AUTO"
    pickup_time: datetime | None = None

    @model_validator(mode="after")
    def require_resolvable_locations(self):
        for side in ("pickup", "dropoff"):
            address = getattr(self, f"{side}_address")
            latitude = getattr(self, f"{side}_latitude")
            longitude = getattr(self, f"{side}_longitude")
            if not address and (latitude is None or longitude is None):
                raise ValueError(f"{side} requires an address or latitude and longitude")
        return self


class QuoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    distance_km: int
    duration_minutes: int
    weather_surcharge: int
    discount: int
    amount: int
    vehicle_type: str
    tariff_version: str
    quote_source: str
    distance_meters: int | None
    duration_seconds: int | None
    pickup_address: str | None
    pickup_latitude: float | None
    pickup_longitude: float | None
    pickup_place_id: str | None
    dropoff_address: str | None
    dropoff_latitude: float | None
    dropoff_longitude: float | None
    dropoff_place_id: str | None
    weather: str
    weather_source: str
    traffic_level: str
    demand_level: str
    demand_multiplier_bps: int
    base_fee: int
    distance_fee: int
    time_fee: int
    peak_surcharge: int
    demand_surcharge: int
    created_at: datetime


class RouteLocationOut(BaseModel):
    address: str
    latitude: float
    longitude: float
    place_id: str | None = None


class LiveQuoteOut(BaseModel):
    quote: QuoteOut
    pickup: RouteLocationOut
    dropoff: RouteLocationOut
    distance_meters: int
    duration_seconds: int
    weather: Literal["CLEAR", "RAIN"]
    weather_source: str
    route_provider: str
    traffic_level: str


class BookingCreate(BaseModel):
    quote_id: str
    scenario: Scenario = "HAPPY_PATH"
    payment_method: str | None = None


class GpsPoint(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    recorded_at: datetime | None = None


class FinalizeFareInput(BaseModel):
    actual_duration_seconds: int = Field(ge=1, le=86_400)
    actual_distance_meters: int | None = Field(default=None, ge=1, le=2_000_000)
    gps_points: list[GpsPoint] = Field(default_factory=list)
    waiting_seconds: int = Field(default=0, ge=0, le=14_400)
    toll_fee: int = Field(default=0, ge=0, le=5_000_000)

    @model_validator(mode="after")
    def require_distance(self):
        if self.actual_distance_meters is None and len(self.gps_points) < 2:
            raise ValueError("provide actual_distance_meters or at least two gps_points")
        return self


class DriverLocationOut(BaseModel):
    latitude: float
    longitude: float


class DriverVehicleOut(BaseModel):
    type: VehicleType
    make: str
    model: str
    color: str
    license_plate: str


class DriverOut(BaseModel):
    id: str
    display_name: str
    phone_masked: str
    rating: float
    total_trips: int
    avatar_color: str
    status: str
    vehicle: DriverVehicleOut
    eta_seconds: int | None = None
    current_location: DriverLocationOut | None = None


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    quote_id: str
    amount: int
    authorized_amount: int
    final_amount: int | None
    currency: str
    scenario: str
    payment_method: str
    payment_intent_id: str | None
    driver_id: str | None
    driver_attempts: int
    driver_status: str | None
    driver_eta_seconds: int | None
    driver_latitude: float | None
    driver_longitude: float | None
    driver: DriverOut | None
    status: str
    last_error: str | None
    created_at: datetime
    updated_at: datetime


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    request_id: str
    method: str
    path: str
    status_code: int
    duration_ms: int
    idempotency_key: str | None
    request_body: str | None
    created_at: datetime
