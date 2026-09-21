"""HTTP client for the Ride Service public contract with bounded retries."""

from __future__ import annotations

import asyncio
from uuid import uuid4

import httpx

from src.application.domains.ride.contracts import BookingCreateRequest, BookingSummary, LiveQuoteRequest, QuoteSummary
from src.core.config import get_settings


class RideApiError(Exception):
    """A safe, structured error that can be returned to the current user turn."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        code: str = "ride_service_request_failed",
        attempts: int = 1,
    ):
        self.status_code = status_code
        self.code = code
        self.attempts = attempts
        super().__init__(message)

    def to_payload(self) -> dict:
        return {
            "service": "ride",
            "code": self.code,
            "status_code": self.status_code,
            "attempts": self.attempts,
            "message": str(self),
        }


class RideServiceClient:
    """Calls Ride with bounded retry; POST retries keep the same idempotency key."""

    _retryable_status_codes = {429, 502, 503, 504}

    def __init__(
        self,
        base_url: str | None = None,
        timeout: float | None = None,
        retry_max_attempts: int | None = None,
        retry_base_delay_seconds: float | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        settings = get_settings()
        self.base_url = (base_url or settings.ride_service_url).rstrip("/")
        self.timeout = timeout or settings.api_timeout_seconds
        self.retry_max_attempts = retry_max_attempts or settings.service_retry_max_attempts
        self.retry_base_delay_seconds = (
            retry_base_delay_seconds
            if retry_base_delay_seconds is not None
            else settings.service_retry_base_delay_seconds
        )
        self.transport = transport

    async def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict | None = None,
        idempotency_key: str | None = None,
    ) -> dict:
        headers = {"Idempotency-Key": idempotency_key} if idempotency_key else {}
        for attempt in range(1, self.retry_max_attempts + 1):
            try:
                async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout, transport=self.transport) as client:
                    response = await client.request(method, path, json=payload, headers=headers)
            except httpx.ConnectTimeout as exc:
                if await self._retry_or_stop(attempt):
                    continue
                raise RideApiError(
                    "Ride Service không phản hồi trước thời hạn kết nối.",
                    code="ride_service_connect_timeout",
                    attempts=attempt,
                ) from exc
            except httpx.TimeoutException as exc:
                if await self._retry_or_stop(attempt):
                    continue
                raise RideApiError(
                    "Ride Service phản hồi quá thời hạn cho phép.",
                    code="ride_service_timeout",
                    attempts=attempt,
                ) from exc
            except httpx.RequestError as exc:
                if await self._retry_or_stop(attempt):
                    continue
                raise RideApiError(
                    "Không kết nối được tới Ride Service.",
                    code="ride_service_unreachable",
                    attempts=attempt,
                ) from exc

            if response.status_code in self._retryable_status_codes and attempt < self.retry_max_attempts:
                await self._retry_or_stop(attempt, response.headers.get("Retry-After"))
                continue
            if response.is_error:
                raise self._http_error(response, attempt)
            return response.json()

        raise RideApiError("Ride Service không thể hoàn tất yêu cầu.", attempts=self.retry_max_attempts)

    async def _retry_or_stop(self, attempt: int, retry_after: str | None = None) -> bool:
        if attempt >= self.retry_max_attempts:
            return False
        delay = self._retry_delay(attempt, retry_after)
        if delay:
            await asyncio.sleep(delay)
        return True

    def _retry_delay(self, attempt: int, retry_after: str | None = None) -> float:
        if retry_after:
            try:
                return min(float(retry_after), 3.0)
            except ValueError:
                pass
        return min(self.retry_base_delay_seconds * (2 ** (attempt - 1)), 3.0)

    @staticmethod
    def _http_error(response: httpx.Response, attempts: int) -> RideApiError:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        upstream_code = None
        if isinstance(detail, dict):
            upstream_code = detail.get("code")
            detail = detail.get("message") or detail
        detail_text = str(detail).strip().replace("\n", " ")[:500]
        message = f"Ride Service trả về HTTP {response.status_code}."
        if detail_text:
            message = f"{message} Chi tiết: {detail_text}"
        code = str(upstream_code) if upstream_code else f"ride_service_http_{response.status_code}"
        return RideApiError(message, response.status_code, code, attempts)
    async def create_live_quote(self, request: LiveQuoteRequest) -> QuoteSummary:
        payload = await self._request(
            "POST",
            "/v1/rides/quotes/live",
            payload=request.model_dump(exclude_none=True),
            idempotency_key=str(uuid4()),
        )
        return QuoteSummary.model_validate(payload["quote"])

    async def create_booking(self, request: BookingCreateRequest, idempotency_key: str | None = None) -> BookingSummary:
        payload = await self._request(
            "POST", "/v1/rides/bookings", payload=request.model_dump(), idempotency_key=idempotency_key or str(uuid4())
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

