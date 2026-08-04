"""Real, bounded tools exposed to the ride concierge LLM."""

import json
import re
from typing import Any

from langchain_core.tools import BaseTool, tool

from src.api.ride_client import RideApiError, RideServiceClient
from src.models.ride import BookingCreateRequest, LiveQuoteRequest


def _result(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, default=str)


def _clean_location(value: str) -> str:
    """Remove a trailing vehicle qualifier from an otherwise valid location."""
    return re.split(r"\s+(?:b\S*ng|bang)\s+(?:xe\s*)?(?:4|7)\b|\s+(?:car|xe)[_-]?(?:4|7)\b", value, maxsplit=1, flags=re.IGNORECASE)[0].strip()

def build_ride_tools(client: RideServiceClient) -> list[BaseTool]:
    """Create only API-backed tools; no tool returns mock or invented data."""

    @tool
    async def create_live_ride_quote(
        pickup_address: str,
        dropoff_address: str,
        vehicle_type: str = "CAR_4",
        promo_code: str | None = None,
    ) -> str:
        """Create a live ride quote. Call only when pickup and dropoff are both known."""
        try:
            quote = await client.create_live_quote(
                LiveQuoteRequest(
                    pickup_address=_clean_location(pickup_address),
                    dropoff_address=_clean_location(dropoff_address),
                    vehicle_type=vehicle_type.upper(),  # type: ignore[arg-type]
                    promo_code=promo_code,
                )
            )
            return _result({"ok": True, "resource": "quote", "data": quote.model_dump()})
        except RideApiError as exc:
            return _result({"ok": False, "error": str(exc), "status_code": exc.status_code})

    @tool
    async def create_multi_vehicle_quotes(
        pickup_address: str,
        dropoff_address: str,
        promo_code: str | None = None,
    ) -> str:
        """Create quotes for multiple vehicle types at once (BIKE, CAR_4, CAR_7). Call when user asks for prices generally without specifying a vehicle."""
        try:
            quotes = []
            for v_type in ["BIKE", "CAR_4", "CAR_7"]:
                q = await client.create_live_quote(
                    LiveQuoteRequest(
                        pickup_address=_clean_location(pickup_address),
                        dropoff_address=_clean_location(dropoff_address),
                        vehicle_type=v_type,
                        promo_code=promo_code,
                    )
                )
                quotes.append(q.model_dump())
            return _result({"ok": True, "resource": "multi_quote", "data": quotes})
        except RideApiError as exc:
            return _result({"ok": False, "error": str(exc), "status_code": exc.status_code})

    @tool
    async def create_ride_booking(quote_id: str) -> str:
        """Book the most recently quoted ride after the user explicitly confirms booking."""
        try:
            booking = await client.create_booking(BookingCreateRequest(quote_id=quote_id))
            return _result({"ok": True, "resource": "booking", "data": booking.model_dump()})
        except RideApiError as exc:
            return _result({"ok": False, "error": str(exc), "status_code": exc.status_code})

    @tool
    async def get_ride_booking_status(booking_id: str) -> str:
        """Fetch the latest driver, booking, and payment status for an existing ride."""
        try:
            booking = await client.get_booking(booking_id)
            return _result({"ok": True, "resource": "booking", "data": booking.model_dump()})
        except RideApiError as exc:
            return _result({"ok": False, "error": str(exc), "status_code": exc.status_code})

    @tool
    async def cancel_ride_booking(booking_id: str) -> str:
        """Cancel an existing ride, or refund it when the Ride API reports a paid ride."""
        try:
            booking = await client.cancel_booking(booking_id)
            return _result({"ok": True, "resource": "booking", "data": booking.model_dump()})
        except RideApiError as exc:
            return _result({"ok": False, "error": str(exc), "status_code": exc.status_code})

    @tool
    async def complete_ride_booking(booking_id: str) -> str:
        """Complete a ride and capture payment. Call only after the user asks to complete it."""
        try:
            booking = await client.complete_booking(booking_id)
            return _result({"ok": True, "resource": "booking", "data": booking.model_dump()})
        except RideApiError as exc:
            return _result({"ok": False, "error": str(exc), "status_code": exc.status_code})

    @tool
    async def finalize_ride_fare(
        booking_id: str,
        actual_duration_seconds: int,
        waiting_seconds: int = 0,
        toll_fee: int = 0,
    ) -> str:
        """Finalize the fare for a completed ride before capturing payment.
        Call when the ride has ended and actual trip data is available."""
        try:
            payload = {
                "actual_duration_seconds": actual_duration_seconds,
                "waiting_seconds": waiting_seconds,
                "toll_fee": toll_fee,
                "gps_points": [] # Mocked for simplicity, actual would have GPS
            }
            booking = await client.finalize_fare(booking_id, payload)
            return _result({"ok": True, "resource": "booking", "data": booking.model_dump()})
        except RideApiError as exc:
            return _result({"ok": False, "error": str(exc), "status_code": exc.status_code})

    @tool
    async def get_ride_fare_breakdown(quote_id: str) -> str:
        """Get detailed fare breakdown for a quote showing base fee, distance fee,
        time fee, weather surcharge, demand multiplier, and discount.
        Call when user asks why the price is what it is."""
        try:
            quote_detail = await client.get_quote_detail(quote_id)
            return _result({"ok": True, "resource": "fare_breakdown", "data": quote_detail})
        except RideApiError as exc:
            return _result({"ok": False, "error": str(exc), "status_code": exc.status_code})

    @tool
    async def get_audit_logs(limit: int = 20) -> str:
        """Get the API audit logs. Call when user wants to see transaction history."""
        try:
            logs = await client.get_audit_logs(limit)
            return _result({"ok": True, "resource": "audit_logs", "data": logs})
        except RideApiError as exc:
            return _result({"ok": False, "error": str(exc), "status_code": exc.status_code})

    return [
        create_live_ride_quote,
        create_multi_vehicle_quotes,
        create_ride_booking,
        get_ride_booking_status,
        cancel_ride_booking,
        complete_ride_booking,
        finalize_ride_fare,
        get_ride_fare_breakdown,
        get_audit_logs,
    ]
