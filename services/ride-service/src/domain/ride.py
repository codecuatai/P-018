from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any
from uuid import uuid4

from src.config import get_settings


class VehicleType(StrEnum):
    BIKE = "BIKE"
    CAR_4 = "CAR_4"
    CAR_7 = "CAR_7"


class QuoteStatus(StrEnum):
    QUOTE_CREATED = "QUOTE_CREATED"
    AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION"
    CONSUMED = "CONSUMED"
    EXPIRED = "EXPIRED"


class BookingStatus(StrEnum):
    AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION"
    # Kept only to read rows created before the lifecycle correction. Runtime
    # responses normalize this value to AWAITING_CONFIRMATION.
    AWAITING_PAYMENT_CONFIRMATION = "AWAITING_PAYMENT_CONFIRMATION"
    SEARCHING_DRIVER = "SEARCHING_DRIVER"
    DRIVER_ASSIGNED = "DRIVER_ASSIGNED"
    DRIVER_TO_PICKUP = "DRIVER_TO_PICKUP"
    DRIVER_ARRIVED = "DRIVER_ARRIVED"
    IN_PROGRESS = "IN_PROGRESS"
    ARRIVED_DESTINATION = "ARRIVED_DESTINATION"
    COMPLETED = "COMPLETED"
    NO_DRIVER = "NO_DRIVER"
    FAILED = "FAILED"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    CANCELLED = "CANCELLED"


@dataclass(frozen=True)
class QuoteCommand:
    actor_id: str
    pickup_address: str
    dropoff_address: str
    vehicle_type: VehicleType
    promo_code: str | None
    pickup_time: datetime | None
    pickup_latitude: float | None = None
    pickup_longitude: float | None = None
    dropoff_latitude: float | None = None
    dropoff_longitude: float | None = None
    route_provider: str | None = None
    route_distance_meters: int | None = None
    route_duration_seconds: int | None = None
    route_geometry: list[dict[str, float]] | None = None
    route_snapshot_hash: str | None = None


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
    status: str
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
    pickup_latitude: float | None = None
    pickup_longitude: float | None = None
    dropoff_latitude: float | None = None
    dropoff_longitude: float | None = None
    route_provider: str = "deterministic-address-hash"
    route_distance_meters: int | None = None
    route_duration_seconds: int | None = None
    route_polyline: str | None = None
    route_geometry: list[dict[str, float]] | None = None
    route_snapshot_hash: str | None = None
    tariff_snapshot: dict[str, Any] | None = None

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
    driver_id: str | None = None
    tracking_started_at: datetime | None = None

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


BOOKING_TRANSITIONS: dict[str, frozenset[str]] = {
    BookingStatus.AWAITING_CONFIRMATION.value: frozenset(
        {
            BookingStatus.SEARCHING_DRIVER.value,
            BookingStatus.CANCELLED.value,
            BookingStatus.PAYMENT_FAILED.value,
            BookingStatus.FAILED.value,
        }
    ),
    BookingStatus.SEARCHING_DRIVER.value: frozenset(
        {
            BookingStatus.DRIVER_ASSIGNED.value,
            BookingStatus.NO_DRIVER.value,
            BookingStatus.CANCELLED.value,
            BookingStatus.FAILED.value,
        }
    ),
    BookingStatus.DRIVER_ASSIGNED.value: frozenset(
        {
            BookingStatus.DRIVER_TO_PICKUP.value,
            BookingStatus.CANCELLED.value,
        }
    ),
    BookingStatus.DRIVER_TO_PICKUP.value: frozenset(
        {
            BookingStatus.DRIVER_ARRIVED.value,
            BookingStatus.CANCELLED.value,
        }
    ),
    BookingStatus.DRIVER_ARRIVED.value: frozenset(
        {
            BookingStatus.IN_PROGRESS.value,
            BookingStatus.CANCELLED.value,
        }
    ),
    BookingStatus.IN_PROGRESS.value: frozenset(
        {
            BookingStatus.ARRIVED_DESTINATION.value,
            BookingStatus.FAILED.value,
        }
    ),
    BookingStatus.ARRIVED_DESTINATION.value: frozenset({BookingStatus.COMPLETED.value}),
    BookingStatus.COMPLETED.value: frozenset(),
    BookingStatus.NO_DRIVER.value: frozenset(),
    BookingStatus.FAILED.value: frozenset(),
    BookingStatus.PAYMENT_FAILED.value: frozenset(),
    BookingStatus.CANCELLED.value: frozenset(),
}

QUOTE_TRANSITIONS: dict[str, frozenset[str]] = {
    QuoteStatus.QUOTE_CREATED.value: frozenset({QuoteStatus.AWAITING_CONFIRMATION.value, QuoteStatus.EXPIRED.value}),
    QuoteStatus.AWAITING_CONFIRMATION.value: frozenset({QuoteStatus.CONSUMED.value, QuoteStatus.EXPIRED.value}),
    QuoteStatus.CONSUMED.value: frozenset(),
    QuoteStatus.EXPIRED.value: frozenset(),
}


QUOTE_TTL = timedelta(minutes=10)
PROMO_DISCOUNTS = {"SAVE5000": 5_000}


def utc_now() -> datetime:
    return datetime.now(UTC)


def normalized_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(_json_safe(payload), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def confirmation_request_payload(evidence: ConfirmationEvidence) -> dict[str, Any]:
    """Return the stable request-bound part of confirmation evidence.

    Issuance timestamps are validity evidence, not the normalized payload for
    an idempotent write. Excluding them lets a gateway retry with the same
    actor/operation/key and payload without turning a harmless clock change
    into an idempotency conflict.
    """
    return {
        key: value
        for key, value in asdict(evidence).items()
        if key not in {"issued_at", "expires_at"}
    }


def quote_request_payload(command: QuoteCommand) -> dict[str, Any]:
    return _json_safe(asdict(command))


def normalize_booking_status(status: str) -> str:
    if status == BookingStatus.AWAITING_PAYMENT_CONFIRMATION.value:
        return BookingStatus.AWAITING_CONFIRMATION.value
    return status


def validate_booking_transition(current: str, target: str) -> None:
    normalized_current = normalize_booking_status(current)
    if target == normalized_current:
        return
    if target not in BOOKING_TRANSITIONS.get(normalized_current, frozenset()):
        raise RideError(
            409,
            "INVALID_BOOKING_TRANSITION",
            f"Cannot transition booking from {normalized_current} to {target}.",
        )


def transition_booking(booking: Booking, target: str) -> None:
    current = normalize_booking_status(booking.status)
    validate_booking_transition(current, target)
    if target == current:
        return
    booking.status = target
    booking.resource_version += 1
    booking.updated_at = utc_now()


def validate_quote_transition(current: str, target: str) -> None:
    if target == current:
        return
    if target not in QUOTE_TRANSITIONS.get(current, frozenset()):
        raise RideError(
            409,
            "INVALID_QUOTE_TRANSITION",
            f"Cannot transition quote from {current} to {target}.",
        )


def transition_quote(quote: Quote, target: str) -> None:
    validate_quote_transition(quote.status, target)
    quote.status = target


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


def create_quote(command: QuoteCommand, tariff: dict[str, Any], *, now: datetime | None = None) -> Quote:
    now = now or utc_now()
    seed = hashlib.sha256(
        f"{command.pickup_address.strip().casefold()}|{command.dropoff_address.strip().casefold()}".encode()
    ).hexdigest()
    coordinates_available = all(value is not None for value in (command.pickup_latitude, command.pickup_longitude, command.dropoff_latitude, command.dropoff_longitude))
    real_route_available = (
        coordinates_available
        and command.route_provider == "geoapify"
        and command.route_distance_meters is not None
        and command.route_duration_seconds is not None
        and len(command.route_geometry or []) >= 2
    )
    if real_route_available:
        distance_km = max(1, round((command.route_distance_meters or 0) / 1000))
        duration_minutes = max(1, round((command.route_duration_seconds or 0) / 60))
    elif coordinates_available:
        distance_km = max(1, round(_haversine_km(command.pickup_latitude or 0, command.pickup_longitude or 0, command.dropoff_latitude or 0, command.dropoff_longitude or 0)))
        duration_minutes = max(3, round(distance_km * 3.2))
    else:
        distance_km = 3 + int(seed[:4], 16) % 28
        duration_minutes = distance_km * 3 + int(seed[4:6], 16) % 10
    tariff_version = str(tariff["version"])
    peak_surcharge = 5_000 if command.pickup_time and _is_peak(command.pickup_time) else 0
    discount = PROMO_DISCOUNTS.get((command.promo_code or "").upper(), 0)
    base_fee = int(tariff["base_fee"])
    distance_fee = distance_km * int(tariff["per_km"])
    time_fee = duration_minutes * int(tariff["per_minute"])
    amount = max(0, base_fee + distance_fee + time_fee + peak_surcharge - discount)
    quote_id = f"quote_{uuid4().hex[:20]}"
    route_provider = command.route_provider if real_route_available else ("deterministic-haversine" if coordinates_available else "deterministic-address-hash")
    route_distance_meters = command.route_distance_meters if real_route_available else distance_km * 1000
    route_duration_seconds = command.route_duration_seconds if real_route_available else duration_minutes * 60
    route_geometry = command.route_geometry if real_route_available else None
    route_polyline = None if real_route_available else _route_polyline(command.pickup_latitude, command.pickup_longitude, command.dropoff_latitude, command.dropoff_longitude)
    route_snapshot = {
        "provider": route_provider,
        "origin": {"latitude": command.pickup_latitude, "longitude": command.pickup_longitude},
        "destination": {"latitude": command.dropoff_latitude, "longitude": command.dropoff_longitude},
        "distance_meters": route_distance_meters,
        "duration_seconds": route_duration_seconds,
        "polyline": route_polyline,
        "geometry": route_geometry,
    }
    return Quote(
        id=quote_id,
        actor_id=command.actor_id,
        status=QuoteStatus.QUOTE_CREATED.value,
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
        tariff_version=tariff_version,
        quote_version=f"{tariff_version}:{quote_id}",
        expires_at=now + QUOTE_TTL,
        created_at=now,
        pickup_latitude=command.pickup_latitude,
        pickup_longitude=command.pickup_longitude,
        dropoff_latitude=command.dropoff_latitude,
        dropoff_longitude=command.dropoff_longitude,
        route_provider=route_provider,
        route_distance_meters=route_distance_meters,
        route_duration_seconds=route_duration_seconds,
        route_polyline=route_polyline,
        route_geometry=route_geometry,
        route_snapshot_hash=command.route_snapshot_hash or normalized_hash(route_snapshot),
        tariff_snapshot={"version": tariff_version, **tariff},
    )


def tracking_snapshot(booking: Booking, quote: Quote, *, now: datetime | None = None) -> dict[str, Any]:
    now = now or utc_now()
    # The booking record is the authoritative timestamp. Polling must not
    # manufacture a newer response timestamp when no lifecycle transition was
    # persisted, otherwise two immediate reads are observably different.
    snapshot_at = _as_utc(booking.updated_at)
    route = {
        "provider": quote.route_provider,
        "distance_meters": quote.route_distance_meters,
        "duration_seconds": quote.route_duration_seconds,
        "polyline": quote.route_polyline,
        "geometry": quote.route_geometry,
        "origin": _point(quote.pickup_latitude, quote.pickup_longitude),
        "destination": _point(quote.dropoff_latitude, quote.dropoff_longitude),
    }
    status = normalize_booking_status(booking.status)
    if status in {
        BookingStatus.AWAITING_CONFIRMATION.value,
        BookingStatus.SEARCHING_DRIVER.value,
        BookingStatus.NO_DRIVER.value,
        BookingStatus.FAILED.value,
        BookingStatus.PAYMENT_FAILED.value,
    }:
        return {
            "booking_id": booking.id,
            "status": status,
            "progress": 0.0,
            "eta_seconds": 0,
            "driver": booking.driver if status not in {BookingStatus.SEARCHING_DRIVER.value, BookingStatus.NO_DRIVER.value} else None,
            "driver_location": None,
            "current_location": None,
            "route": route,
            "route_provider": quote.route_provider,
            "route_snapshot_hash": quote.route_snapshot_hash,
            "updated_at": snapshot_at.isoformat(),
        }
    if status == BookingStatus.CANCELLED.value:
        return {
            "booking_id": booking.id,
            "status": BookingStatus.CANCELLED.value,
            "progress": 0.0,
            "eta_seconds": 0,
            "driver": booking.driver,
            "driver_location": None,
            "current_location": None,
            "route": route,
            "route_provider": quote.route_provider,
            "route_snapshot_hash": quote.route_snapshot_hash,
            "updated_at": snapshot_at.isoformat(),
        }
    if status in {BookingStatus.ARRIVED_DESTINATION.value, BookingStatus.COMPLETED.value}:
        return {
            "booking_id": booking.id,
            "status": status,
            "progress": 1.0,
            "eta_seconds": 0,
            "driver": booking.driver,
            "driver_location": _simulated_driver_location(booking.driver or {}, quote, 0, 0, 1, status),
            "current_location": _simulated_driver_location(booking.driver or {}, quote, 0, 0, 1, status),
            "route": route,
            "route_provider": quote.route_provider,
            "route_snapshot_hash": quote.route_snapshot_hash,
            "updated_at": snapshot_at.isoformat(),
        }
    driver = booking.driver or {}
    eta_seconds = int(driver.get("eta_seconds", 0))
    # The simulator advances on a coarse, deterministic clock tick.  This keeps
    # two immediate polling requests stable while still moving the trip every
    # couple of seconds, which is the cadence used by the demo client.
    elapsed = tracking_elapsed(booking, now)
    travel_seconds = max(60, int(quote.route_duration_seconds or quote.duration_minutes * 60))
    status = tracking_status_for_elapsed(status, elapsed, eta_seconds, travel_seconds)
    progress = tracking_progress(status, elapsed, eta_seconds, travel_seconds)
    eta_remaining = (
        max(0, eta_seconds - int(elapsed))
        if status in {BookingStatus.DRIVER_ASSIGNED.value, BookingStatus.DRIVER_TO_PICKUP.value}
        else max(0, int(eta_seconds + 60 + travel_seconds - elapsed))
        if status == BookingStatus.IN_PROGRESS.value
        else 0
    )
    driver_location = _simulated_driver_location(driver, quote, elapsed, eta_seconds, travel_seconds, status)
    return {
        "booking_id": booking.id,
        "status": status,
        "progress": round(progress, 4),
        "eta_seconds": eta_remaining,
        "driver": driver,
        "driver_location": driver_location,
        "current_location": driver_location,
        "route": route,
        "route_provider": quote.route_provider,
        "route_snapshot_hash": quote.route_snapshot_hash,
        "updated_at": snapshot_at.isoformat(),
    }


def _is_peak(value: datetime) -> bool:
    hour = value.astimezone(UTC).hour if value.tzinfo else value.hour
    return 0 <= hour < 2 or 10 <= hour < 13


def _haversine_km(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    from math import atan2, cos, radians, sin, sqrt
    d_lat = radians(latitude_b - latitude_a)
    d_lon = radians(longitude_b - longitude_a)
    value = sin(d_lat / 2) ** 2 + cos(radians(latitude_a)) * cos(radians(latitude_b)) * sin(d_lon / 2) ** 2
    return 6371 * 2 * atan2(sqrt(value), sqrt(1 - value))


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _point(latitude: float | None, longitude: float | None) -> dict[str, float] | None:
    if latitude is None or longitude is None:
        return None
    return {"latitude": latitude, "longitude": longitude}


def _route_polyline(
    pickup_latitude: float | None,
    pickup_longitude: float | None,
    dropoff_latitude: float | None,
    dropoff_longitude: float | None,
) -> str | None:
    points = [_point(pickup_latitude, pickup_longitude), _point(dropoff_latitude, dropoff_longitude)]
    if any(point is None for point in points):
        return None
    return json.dumps(points, ensure_ascii=False, separators=(",", ":"))


def _simulated_driver_location(
    driver: dict[str, Any],
    quote: Quote,
    elapsed: float,
    eta_seconds: int,
    travel_seconds: int,
    status: str,
) -> dict[str, float] | None:
    pickup = _point(quote.pickup_latitude, quote.pickup_longitude)
    destination = _point(quote.dropoff_latitude, quote.dropoff_longitude)
    start = driver.get("location") if isinstance(driver.get("location"), dict) else None
    if not pickup or not destination or not start:
        return None
    if status in {BookingStatus.DRIVER_ASSIGNED.value, BookingStatus.DRIVER_TO_PICKUP.value}:
        return _interpolate(start, pickup, elapsed / max(1, eta_seconds))
    if status == BookingStatus.DRIVER_ARRIVED.value:
        return pickup
    if status in {BookingStatus.IN_PROGRESS.value, BookingStatus.ARRIVED_DESTINATION.value, BookingStatus.COMPLETED.value}:
        ratio = 1.0 if status in {BookingStatus.ARRIVED_DESTINATION.value, BookingStatus.COMPLETED.value} else (elapsed - eta_seconds - 60) / max(1, travel_seconds)
        return _interpolate(pickup, destination, ratio)
    return start


def _interpolate(start: dict[str, Any], end: dict[str, Any], ratio: float) -> dict[str, float]:
    bounded = min(1.0, max(0.0, ratio))
    return {
        "latitude": round(float(start["latitude"]) + (float(end["latitude"]) - float(start["latitude"])) * bounded, 6),
        "longitude": round(float(start["longitude"]) + (float(end["longitude"]) - float(start["longitude"])) * bounded, 6),
    }


def tracking_elapsed(booking: Booking, now: datetime) -> float:
    started = _as_utc(booking.tracking_started_at or booking.updated_at)
    elapsed = max(0.0, (_as_utc(now) - started).total_seconds())
    scaled = elapsed * get_settings().tracking_time_scale
    return float(int(scaled // 2) * 2)


def tracking_status_for_elapsed(status: str, elapsed: float, eta_seconds: int, travel_seconds: int) -> str:
    normalized = normalize_booking_status(status)
    if normalized == BookingStatus.DRIVER_ASSIGNED.value:
        if elapsed <= 0:
            return normalized
        if elapsed < eta_seconds:
            return BookingStatus.DRIVER_TO_PICKUP.value
        if elapsed < eta_seconds + 60:
            return BookingStatus.DRIVER_ARRIVED.value
        if elapsed < eta_seconds + 60 + travel_seconds:
            return BookingStatus.IN_PROGRESS.value
        return BookingStatus.ARRIVED_DESTINATION.value
    if normalized == BookingStatus.DRIVER_TO_PICKUP.value:
        if elapsed < eta_seconds:
            return normalized
        if elapsed < eta_seconds + 60:
            return BookingStatus.DRIVER_ARRIVED.value
        if elapsed < eta_seconds + 60 + travel_seconds:
            return BookingStatus.IN_PROGRESS.value
        return BookingStatus.ARRIVED_DESTINATION.value
    if normalized == BookingStatus.DRIVER_ARRIVED.value:
        if elapsed < eta_seconds + 60:
            return normalized
        if elapsed < eta_seconds + 60 + travel_seconds:
            return BookingStatus.IN_PROGRESS.value
        return BookingStatus.ARRIVED_DESTINATION.value
    if normalized == BookingStatus.IN_PROGRESS.value:
        return BookingStatus.IN_PROGRESS.value if elapsed < eta_seconds + 60 + travel_seconds else BookingStatus.ARRIVED_DESTINATION.value
    if normalized == BookingStatus.ARRIVED_DESTINATION.value:
        return normalized
    return normalized


def next_tracking_status(status: str, elapsed: float, eta_seconds: int, travel_seconds: int) -> str | None:
    normalized = normalize_booking_status(status)
    if normalized == BookingStatus.DRIVER_ASSIGNED.value and elapsed > 0:
        return BookingStatus.DRIVER_TO_PICKUP.value
    if normalized == BookingStatus.DRIVER_TO_PICKUP.value and elapsed >= eta_seconds:
        return BookingStatus.DRIVER_ARRIVED.value
    if normalized == BookingStatus.DRIVER_ARRIVED.value and elapsed >= eta_seconds + 60:
        return BookingStatus.IN_PROGRESS.value
    if normalized == BookingStatus.IN_PROGRESS.value and elapsed >= eta_seconds + 60 + travel_seconds:
        return BookingStatus.ARRIVED_DESTINATION.value
    return None


def tracking_progress(status: str, elapsed: float, eta_seconds: int, travel_seconds: int) -> float:
    normalized = normalize_booking_status(status)
    if normalized == BookingStatus.DRIVER_ASSIGNED.value:
        return 0.0
    if normalized == BookingStatus.DRIVER_TO_PICKUP.value:
        return min(0.25, max(0.0, elapsed / max(1, eta_seconds) * 0.25))
    if normalized == BookingStatus.DRIVER_ARRIVED.value:
        return 0.25
    if normalized == BookingStatus.IN_PROGRESS.value:
        return min(1.0, 0.25 + max(0.0, elapsed - eta_seconds - 60) / max(1, travel_seconds) * 0.75)
    if normalized == BookingStatus.ARRIVED_DESTINATION.value:
        return 1.0
    if normalized == BookingStatus.COMPLETED.value:
        return 1.0
    return 0.0


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
