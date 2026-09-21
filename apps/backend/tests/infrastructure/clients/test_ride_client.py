import httpx
import pytest

from src.infrastructure.clients.ride_client import RideApiError, RideServiceClient


@pytest.mark.asyncio
async def test_retries_transient_response_with_the_same_idempotency_key():
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) < 3:
            return httpx.Response(503, json={"detail": "temporarily unavailable"})
        return httpx.Response(200, json={"ok": True})

    client = RideServiceClient(
        base_url="http://ride.test",
        retry_max_attempts=3,
        retry_base_delay_seconds=0,
        transport=httpx.MockTransport(handler),
    )

    payload = await client._request("POST", "/v1/rides/bookings", payload={"quote_id": "quote_1"}, idempotency_key="stable-key")

    assert payload == {"ok": True}
    assert len(requests) == 3
    assert {request.headers["idempotency-key"] for request in requests} == {"stable-key"}


@pytest.mark.asyncio
async def test_does_not_retry_business_validation_error():
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(422, json={"detail": "invalid booking"})

    client = RideServiceClient(
        base_url="http://ride.test",
        retry_max_attempts=3,
        retry_base_delay_seconds=0,
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(RideApiError) as error:
        await client._request("POST", "/v1/rides/bookings", payload={})

    assert calls == 1
    assert error.value.status_code == 422
    assert error.value.attempts == 1
