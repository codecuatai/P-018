from datetime import datetime, timedelta, timezone
from math import asin, ceil, cos, radians, sin, sqrt
from uuid import uuid4

from fastapi import HTTPException

from .drivers import select_simulated_driver
from .geoapify import LocationProviderError
from .models import Booking, Quote
from .payment_gateway import PaymentGatewayError
from .repository import RideRepository
from .schemas import BookingCreate, FinalizeFareInput, LiveQuoteCreate, QuoteCreate

TARIFF_VERSION = "MVP_V2"
TARIFFS = {
    "BIKE": {"base": 8_000, "per_km": 5_000, "per_minute": 700, "wait_per_minute": 700},
    "CAR_4": {"base": 10_000, "per_km": 7_000, "per_minute": 1_000, "wait_per_minute": 1_000},
    "CAR_7": {"base": 15_000, "per_km": 9_000, "per_minute": 1_300, "wait_per_minute": 1_300},
}
RAIN_SURCHARGE = 5_000
PEAK_SURCHARGE = 5_000
PROMO_DISCOUNTS = {"SAVE5000": 5_000}
DEMAND_BPS = {"LOW": 9_000, "NORMAL": 10_000, "HIGH": 12_000}
SCENARIO_METHOD = {
    "PAYMENT_DECLINED": "pm_declined",
    "CAPTURE_FAILED": "pm_capture_failed",
    "CAPTURE_TIMEOUT_BUT_SUCCEEDED": "pm_capture_timeout_succeeded",
}


def _local_time(value: datetime | None) -> datetime:
    vietnam_tz = timezone(timedelta(hours=7))
    value = value or datetime.now(vietnam_tz)
    return value.replace(tzinfo=vietnam_tz) if value.tzinfo is None else value.astimezone(vietnam_tz)


def _is_peak(value: datetime | None) -> bool:
    hour = _local_time(value).hour
    return 7 <= hour < 9 or 17 <= hour < 20


def _auto_demand(requested: str, pickup_time: datetime | None) -> str:
    return ("HIGH" if _is_peak(pickup_time) else "NORMAL") if requested == "AUTO" else requested


def _haversine_meters(points) -> int:
    total = 0.0
    for first, second in zip(points, points[1:]):
        lat1, lon1, lat2, lon2 = map(radians, (first.latitude, first.longitude, second.latitude, second.longitude))
        a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
        total += 6_371_000 * 2 * asin(sqrt(a))
    return max(1, round(total))


class RideService:
    def __init__(self, repository: RideRepository, payment_gateway, location_provider=None):
        self.repository = repository
        self.payment_gateway = payment_gateway
        self.location_provider = location_provider

    def _breakdown(
        self,
        *,
        distance_km: int,
        duration_minutes: int,
        weather: str,
        promo_code: str | None,
        vehicle_type: str,
        demand_level: str,
        pickup_time: datetime | None,
        waiting_seconds: int = 0,
        toll_fee: int = 0,
        snapshot: Quote | None = None,
    ) -> dict:
        tariff = TARIFFS[vehicle_type]
        base_fee = snapshot.base_fee if snapshot else tariff["base"]
        per_km = (snapshot.distance_fee // max(snapshot.distance_km, 1)) if snapshot else tariff["per_km"]
        per_minute = (snapshot.time_fee // max(snapshot.duration_minutes, 1)) if snapshot else tariff["per_minute"]
        distance_fee, time_fee = distance_km * per_km, duration_minutes * per_minute
        weather_surcharge = snapshot.weather_surcharge if snapshot else (RAIN_SURCHARGE if weather == "RAIN" else 0)
        peak_surcharge = snapshot.peak_surcharge if snapshot else (PEAK_SURCHARGE if _is_peak(pickup_time) else 0)
        multiplier = snapshot.demand_multiplier_bps if snapshot else DEMAND_BPS[demand_level]
        subtotal = base_fee + distance_fee + time_fee + weather_surcharge + peak_surcharge
        demand_surcharge = subtotal * (multiplier - 10_000) // 10_000
        wait_rate = tariff["wait_per_minute"]
        waiting_fee = ceil(waiting_seconds / 60) * wait_rate
        discount = snapshot.discount if snapshot else PROMO_DISCOUNTS.get(promo_code or "", 0)
        amount = max(0, subtotal + demand_surcharge + waiting_fee + toll_fee - discount)
        return {
            "base_fee": base_fee,
            "distance_fee": distance_fee,
            "time_fee": time_fee,
            "weather_surcharge": weather_surcharge,
            "peak_surcharge": peak_surcharge,
            "demand_surcharge": demand_surcharge,
            "discount": discount,
            "amount": amount,
            "demand_multiplier_bps": multiplier,
            "demand_level": snapshot.demand_level if snapshot else demand_level,
        }

    async def create_quote(self, data: QuoteCreate, *, route: dict | None = None) -> Quote:
        demand_level = _auto_demand(data.demand_level, data.pickup_time)
        breakdown = self._breakdown(
            distance_km=data.distance_km,
            duration_minutes=data.duration_minutes,
            weather=data.weather,
            promo_code=data.promo_code,
            vehicle_type=data.vehicle_type,
            demand_level=demand_level,
            pickup_time=data.pickup_time,
        )
        quote = Quote(
            id=f"quote_{uuid4().hex[:20]}",
            distance_km=data.distance_km,
            duration_minutes=data.duration_minutes,
            amount=breakdown["amount"],
            vehicle_type=data.vehicle_type,
            tariff_version=TARIFF_VERSION,
            quote_source="LIVE" if route else "MANUAL",
            distance_meters=route.get("distance_meters") if route else data.distance_km * 1000,
            duration_seconds=route.get("duration_seconds") if route else data.duration_minutes * 60,
            pickup_address=route["pickup"]["address"] if route else None,
            pickup_latitude=route["pickup"]["latitude"] if route else None,
            pickup_longitude=route["pickup"]["longitude"] if route else None,
            pickup_place_id=route["pickup"].get("place_id") if route else None,
            dropoff_address=route["dropoff"]["address"] if route else None,
            dropoff_latitude=route["dropoff"]["latitude"] if route else None,
            dropoff_longitude=route["dropoff"]["longitude"] if route else None,
            dropoff_place_id=route["dropoff"].get("place_id") if route else None,
            weather=data.weather,
            weather_source=route.get("weather_source", "MANUAL") if route else "MANUAL",
            traffic_level=("PEAK_SIMULATED" if _is_peak(data.pickup_time) else route.get("traffic_level", "FREE_FLOW"))
            if route
            else ("PEAK_SIMULATED" if _is_peak(data.pickup_time) else "MANUAL"),
            demand_level=demand_level,
            demand_multiplier_bps=breakdown["demand_multiplier_bps"],
            base_fee=breakdown["base_fee"],
            distance_fee=breakdown["distance_fee"],
            time_fee=breakdown["time_fee"],
            weather_surcharge=breakdown["weather_surcharge"],
            peak_surcharge=breakdown["peak_surcharge"],
            demand_surcharge=breakdown["demand_surcharge"],
            discount=breakdown["discount"],
        )
        return await self.repository.save_quote(quote)

    async def create_live_quote(self, data: LiveQuoteCreate) -> tuple[Quote, dict]:
        if not self.location_provider:
            raise HTTPException(503, "Live routing is not configured; set GEOAPIFY_API_KEY")
        try:
            route = await self.location_provider.calculate_route(data)
        except LocationProviderError as exc:
            raise HTTPException(502, str(exc)) from exc
        quote = await self.create_quote(
            QuoteCreate(
                distance_km=max(1, ceil(route["distance_meters"] / 1000)),
                duration_minutes=max(1, ceil(route["duration_seconds"] / 60)),
                weather=route["weather"],
                promo_code=data.promo_code,
                vehicle_type=data.vehicle_type,
                demand_level=data.demand_level,
                pickup_time=data.pickup_time,
            ),
            route=route,
        )
        return quote, route

    async def get_booking(self, booking_id: str) -> Booking:
        booking = await self.repository.get_booking(booking_id)
        if not booking:
            raise HTTPException(404, "Booking not found")
        return booking

    async def create_booking(self, data: BookingCreate, key: str | None) -> Booking:
        replay = await self.repository.get_idempotent("create", key)
        if replay:
            return replay
        quote = await self.repository.get_quote(data.quote_id)
        if not quote:
            raise HTTPException(404, "Quote not found")
        method = data.payment_method or SCENARIO_METHOD.get(data.scenario, "pm_success")
        authorized_amount = ceil(quote.amount * 12_000 / 10_000)
        booking = Booking(
            id=f"ride_{uuid4().hex[:20]}",
            quote_id=quote.id,
            amount=quote.amount,
            authorized_amount=authorized_amount,
            scenario=data.scenario,
            payment_method=method,
            status="PENDING_PAYMENT",
            driver_attempts=0,
        )
        await self.repository.save_booking(booking, "create", key)
        payment = await self.payment_gateway.create(
            {
                "resource_type": "RIDE_BOOKING",
                "resource_id": booking.id,
                "amount": authorized_amount,
                "currency": "VND",
                "payment_method": method,
            },
            f"{key or booking.id}:payment",
        )
        booking.payment_intent_id = payment["id"]
        authorized = await self.payment_gateway.authorize(payment["id"], f"{key or booking.id}:authorize")
        if authorized["status"] == "DECLINED":
            booking.status, booking.last_error = "PAYMENT_DECLINED", authorized["last_error"]
            return await self.repository.save_booking(booking)
        if data.scenario == "NO_DRIVER":
            booking.status, booking.last_error = "NO_DRIVER", "No simulated driver accepted this ride"
            await self.payment_gateway.cancel(payment["id"], f"{key or booking.id}:cancel")
            return await self.repository.save_booking(booking)
        booking.driver_attempts = 2 if data.scenario == "DRIVER_CANCEL_ONCE" else 1
        booking.driver_status = "REASSIGNED" if data.scenario == "DRIVER_CANCEL_ONCE" else "ASSIGNED"
        driver = select_simulated_driver(quote.vehicle_type, booking.driver_attempts)
        booking.driver_id = driver["id"]
        booking.driver_eta_seconds = 300 if data.scenario == "DRIVER_CANCEL_ONCE" else 240
        booking.driver_latitude = (quote.pickup_latitude or 21.0) + 0.006
        booking.driver_longitude = (quote.pickup_longitude or 105.8) - 0.006
        booking.status = "DRIVER_ASSIGNED"
        return await self.repository.save_booking(booking)

    async def finalize_fare(self, booking_id: str, data: FinalizeFareInput, key: str | None) -> Booking:
        replay = await self.repository.get_idempotent("finalize_fare", key)
        if replay:
            return replay
        booking = await self.get_booking(booking_id)
        if booking.status not in {"DRIVER_ASSIGNED", "FARE_FINALIZED"}:
            raise HTTPException(409, f"Cannot finalize fare in status {booking.status}")
        quote = await self.repository.get_quote(booking.quote_id)
        if not quote:
            raise HTTPException(409, "Booking quote is missing")
        meters = data.actual_distance_meters or _haversine_meters(data.gps_points)
        final = self._breakdown(
            distance_km=max(1, ceil(meters / 1000)),
            duration_minutes=max(1, ceil(data.actual_duration_seconds / 60)),
            weather=quote.weather,
            promo_code=None,
            vehicle_type=quote.vehicle_type,
            demand_level=quote.demand_level,
            pickup_time=quote.created_at,
            waiting_seconds=data.waiting_seconds,
            toll_fee=data.toll_fee,
            snapshot=quote,
        )
        if final["amount"] > booking.authorized_amount:
            raise HTTPException(409, "Final fare exceeds the authorized cap; obtain additional authorization")
        booking.final_amount, booking.status, booking.last_error = final["amount"], "FARE_FINALIZED", None
        return await self.repository.save_booking(booking, "finalize_fare", key)

    async def complete(self, booking_id: str, key: str | None) -> Booking:
        replay = await self.repository.get_idempotent("complete", key)
        if replay:
            return replay
        booking = await self.get_booking(booking_id)
        if booking.status == "PAID":
            return booking
        if booking.status not in {"DRIVER_ASSIGNED", "FARE_FINALIZED"} or not booking.payment_intent_id:
            raise HTTPException(409, f"Cannot complete booking in status {booking.status}")
        capture_amount = booking.final_amount or booking.amount
        booking.status = "COMPLETED"
        await self.repository.save_booking(booking)
        try:
            captured = await self.payment_gateway.capture(
                booking.payment_intent_id, f"{key or booking.id}:capture", capture_amount
            )
        except PaymentGatewayError:
            captured = await self.payment_gateway.get(booking.payment_intent_id)
        if captured["status"] == "CAPTURED":
            booking.status, booking.last_error = "PAID", None
        else:
            booking.status, booking.last_error = (
                "PAYMENT_CAPTURE_FAILED",
                captured.get("last_error") or "Capture failed",
            )
        return await self.repository.save_booking(booking, "complete", key)

    async def cancel(self, booking_id: str, key: str | None) -> Booking:
        replay = await self.repository.get_idempotent("cancel", key)
        if replay:
            return replay
        booking = await self.get_booking(booking_id)
        if booking.status == "PAID":
            refunded = await self.payment_gateway.refund(booking.payment_intent_id, f"{key or booking.id}:refund")
            if refunded["status"] == "REFUNDED":
                booking.status, booking.last_error = "REFUNDED", None
            else:
                booking.status, booking.last_error = "REFUND_FAILED", refunded.get("last_error")
            return await self.repository.save_booking(booking, "cancel", key)
        if booking.payment_intent_id:
            await self.payment_gateway.cancel(booking.payment_intent_id, f"{key or booking.id}:cancel")
        booking.status = "CANCELLED"
        return await self.repository.save_booking(booking, "cancel", key)
