from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any
from uuid import uuid4


class VehicleType(StrEnum):
    BIKE = "BIKE"
    CAR_4 = "CAR_4"
    CAR_7 = "CAR_7"


class BookingStatus(StrEnum):
    AWAITING_PAYMENT_CONFIRMATION = "AWAITING_PAYMENT_CONFIRMATION"
    DRIVER_ASSIGNED = "DRIVER_ASSIGNED"
    CANCELLED = "CANCELLED"


@dataclass(frozen=True)
class QuoteCommand:
    actor_id: str
    pickup_address: str
    dropoff_address: str
    vehicle_type: VehicleType
    promo_code: str | None
    pickup_time: datetime | None


@dataclass(frozen=True)
class ConfirmationEvidence:
    confirmation_id: str
    actor_id: str
    action: str
    payload_hash: str
    quote_version: str
    amount: int
    currency: str
    issued_at: datetime
    expires_at: datetime


@dataclass(frozen=True)
class PrepareBookingCommand:
    actor_id: str
    quote_id: str
    confirmation: ConfirmationEvidence


@dataclass(frozen=True)
class ConfirmBookingCommand:
    actor_id: str
    booking_id: str
    payment_reference: str
    confirmation: ConfirmationEvidence


@dataclass(frozen=True)
class CancelBookingCommand:
    actor_id: str
    booking_id: str
    confirmation: ConfirmationEvidence


@dataclass
class Quote:
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

    def snapshot(self) -> dict[str, Any]:
        return _json_safe(asdict(self))


@dataclass
class Booking:
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

    def snapshot(self) -> dict[str, Any]:
        return _json_safe(asdict(self))


@dataclass(frozen=True)
class IdempotencyRecord:
    actor_id: str
    operation: str
    key: str
    request_hash: str
    response_payload: dict[str, Any]
    created_at: datetime


class RideError(Exception):
    def __init__(self, status: int, code: str, detail: str, *, retryable: bool = False):
        super().__init__(detail)
        self.status = status
        self.code = code
        self.detail = detail
        self.retryable = retryable


TARIFF_VERSION = "SIM_2026_08_V1"
QUOTE_TTL = timedelta(minutes=10)
TARIFFS = {
    VehicleType.BIKE: {"base": 8_000, "per_km": 5_000, "per_minute": 700},
    VehicleType.CAR_4: {"base": 10_000, "per_km": 7_000, "per_minute": 1_000},
    VehicleType.CAR_7: {"base": 15_000, "per_km": 9_000, "per_minute": 1_300},
}
PROMO_DISCOUNTS = {"SAVE5000": 5_000}

SIMULATED_DRIVERS = {
    VehicleType.BIKE: {
        "id": "driver_simulated_bike_001",
        "display_name": "Quang Huy",
        "phone_masked": "*** *** 3908",
        "rating": 4.9,
        "vehicle": {
            "type": "BIKE",
            "make": "Honda",
            "model": "Wave RSX",
            "color": "Đen",
            "license_plate": "29K1-390.80",
        },
        "eta_seconds": 180,
    },
    VehicleType.CAR_4: {
        "id": "driver_simulated_001",
        "display_name": "Minh Anh",
        "phone_masked": "*** *** 4821",
        "rating": 4.9,
        "vehicle": {
            "type": "CAR_4",
            "make": "Toyota",
            "model": "Vios",
            "color": "Trắng",
            "license_plate": "30H-482.19",
        },
        "eta_seconds": 240,
    },
    VehicleType.CAR_7: {
        "id": "driver_simulated_car7_001",
        "display_name": "Đức Long",
        "phone_masked": "*** *** 5520",
        "rating": 4.9,
        "vehicle": {
            "type": "CAR_7",
            "make": "Mitsubishi",
            "model": "Xpander",
            "color": "Bạc",
            "license_plate": "30G-552.07",
        },
        "eta_seconds": 300,
    },
}


def utc_now() -> datetime:
    return datetime.now(UTC)


def normalized_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(_json_safe(payload), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def quote_request_payload(command: QuoteCommand) -> dict[str, Any]:
    return _json_safe(asdict(command))


def prepare_confirmation_payload(quote: Quote, actor_id: str) -> dict[str, Any]:
    return {
        "action": "ride.booking.prepare",
        "actor_id": actor_id,
        "quote_id": quote.id,
        "quote_version": quote.quote_version,
        "amount": quote.amount,
        "currency": quote.currency,
    }


def confirm_confirmation_payload(
    booking: Booking,
    actor_id: str,
    payment_reference: str,
) -> dict[str, Any]:
    return {
        "action": "ride.booking.confirm",
        "actor_id": actor_id,
        "booking_id": booking.id,
        "quote_id": booking.quote_id,
        "quote_version": booking.quote_version,
        "amount": booking.amount,
        "currency": booking.currency,
        "payment_reference": payment_reference,
    }


def cancel_confirmation_payload(booking: Booking, actor_id: str) -> dict[str, Any]:
    return {
        "action": "ride.booking.cancel",
        "actor_id": actor_id,
        "booking_id": booking.id,
        "quote_version": booking.quote_version,
        "amount": booking.amount,
        "currency": booking.currency,
        "resource_version": booking.resource_version,
    }


def create_simulated_quote(command: QuoteCommand, *, now: datetime | None = None) -> Quote:
    now = now or utc_now()
    seed = hashlib.sha256(
        f"{command.pickup_address.strip().casefold()}|{command.dropoff_address.strip().casefold()}".encode()
    ).hexdigest()
    distance_km = 3 + int(seed[:4], 16) % 28
    duration_minutes = distance_km * 3 + int(seed[4:6], 16) % 10
    tariff = TARIFFS[command.vehicle_type]
    peak_surcharge = 5_000 if command.pickup_time and _is_peak(command.pickup_time) else 0
    discount = PROMO_DISCOUNTS.get((command.promo_code or "").upper(), 0)
    base_fee = tariff["base"]
    distance_fee = distance_km * tariff["per_km"]
    time_fee = duration_minutes * tariff["per_minute"]
    amount = max(0, base_fee + distance_fee + time_fee + peak_surcharge - discount)
    quote_id = f"quote_{uuid4().hex[:20]}"
    return Quote(
        id=quote_id,
        actor_id=command.actor_id,
        pickup_address=command.pickup_address.strip(),
        dropoff_address=command.dropoff_address.strip(),
        vehicle_type=command.vehicle_type.value,
        distance_km=distance_km,
        duration_minutes=duration_minutes,
        base_fee=base_fee,
        distance_fee=distance_fee,
        time_fee=time_fee,
        peak_surcharge=peak_surcharge,
        discount=discount,
        amount=amount,
        currency="VND",
        tariff_version=TARIFF_VERSION,
        quote_version=f"{TARIFF_VERSION}:{quote_id}",
        expires_at=now + QUOTE_TTL,
        created_at=now,
    )


def simulated_driver(vehicle_type: str) -> dict[str, Any]:
    return json.loads(json.dumps(SIMULATED_DRIVERS[VehicleType(vehicle_type)], ensure_ascii=False))


def _is_peak(value: datetime) -> bool:
    hour = value.astimezone(UTC).hour if value.tzinfo else value.hour
    return 0 <= hour < 2 or 10 <= hour < 13


def _json_safe(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, StrEnum):
        return value.value
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value
