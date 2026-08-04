"""HTTP client for the Ride Service public contract."""

from uuid import uuid4

import httpx

from src.config import get_settings
from src.models.ride import BookingCreateRequest, BookingSummary, LiveQuoteRequest, QuoteSummary


class RideApiError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        self.status_code = status_code
        super().__init__(message)


class RideServiceClient:
    """The agent may call Ride, but never Payment directly."""

    def __init__(self, base_url: str | None = None, timeout: float | None = None):
        settings = get_settings()
        self.base_url = (base_url or settings.ride_service_url).rstrip("/")
        self.timeout = timeout or settings.api_timeout_seconds

    async def _request(self, method: str, path: str, *, payload: dict | None = None, idempotency_key: str | None = None) -> dict:
        headers = {"Idempotency-Key": idempotency_key} if idempotency_key else {}
        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
                response = await client.request(method, path, json=payload, headers=headers)
        except httpx.RequestError as exc:
            raise RideApiError(f"Không kết nối được Ride Service tại {self.base_url}.") from exc
        if response.is_error:
            try:
                detail = response.json().get("detail", response.text)
            except ValueError:
                detail = response.text
            raise RideApiError(str(detail), response.status_code)
        return response.json()

    async def create_live_quote(self, request: LiveQuoteRequest) -> QuoteSummary:
        payload = await self._request("POST", "/v1/rides/quotes/live", payload=request.model_dump(exclude_none=True))
        return QuoteSummary.model_validate(payload["quote"])

    async def create_booking(self, request: BookingCreateRequest, idempotency_key: str | None = None) -> BookingSummary:
        payload = await self._request(
            "POST",
            "/v1/rides/bookings",
            payload=request.model_dump(),
            idempotency_key=idempotency_key or str(uuid4()),
        )
        return BookingSummary.model_validate(payload)

    async def get_booking(self, booking_id: str) -> BookingSummary:
        payload = await self._request("GET", f"/v1/rides/bookings/{booking_id}")
        return BookingSummary.model_validate(payload)

    async def cancel_booking(self, booking_id: str, idempotency_key: str | None = None) -> BookingSummary:
        payload = await self._request("POST", f"/v1/rides/bookings/{booking_id}/cancel", idempotency_key=idempotency_key or str(uuid4()))
        return BookingSummary.model_validate(payload)

    async def complete_booking(self, booking_id: str, idempotency_key: str | None = None) -> BookingSummary:
        payload = await self._request("POST", f"/v1/rides/bookings/{booking_id}/complete", idempotency_key=idempotency_key or str(uuid4()))
        return BookingSummary.model_validate(payload)

    async def get_quote_detail(self, quote_id: str) -> dict:
        return await self._request("GET", f"/v1/rides/quotes/{quote_id}")

    async def finalize_fare(self, booking_id: str, payload: dict, idempotency_key: str | None = None) -> BookingSummary:
        response = await self._request("POST", f"/v1/rides/bookings/{booking_id}/finalize-fare", payload=payload, idempotency_key=idempotency_key or str(uuid4()))
        return BookingSummary.model_validate(response)

    async def get_audit_logs(self, limit: int = 20) -> list[dict]:
        return await self._request("GET", f"/v1/audit-logs?limit={limit}")
