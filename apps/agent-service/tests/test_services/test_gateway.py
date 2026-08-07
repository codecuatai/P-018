from __future__ import annotations

from collections.abc import Callable
from types import SimpleNamespace

import httpx
import pytest
import src.services.gateway as gateway_module
from src.services.gateway import GatewayToolClient, GatewayToolError


def make_client(handler: Callable[[httpx.Request], httpx.Response]) -> tuple[GatewayToolClient, httpx.AsyncClient]:
    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    gateway = GatewayToolClient(
        base_url="https://configured-gateway.example/internal-base/",
        token="test-internal-token",
        client=http_client,
    )
    return gateway, http_client


@pytest.mark.asyncio
async def test_registry_uses_configured_url_and_token_and_parses_data() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={"data": [{"name": "search_food", "permission": "read"}]},
        )

    gateway, http_client = make_client(handler)
    try:
        assert await gateway.registry("cor_test") == [{"name": "search_food", "permission": "read"}]
    finally:
        await http_client.aclose()

    assert len(requests) == 1
    assert str(requests[0].url) == "https://configured-gateway.example/internal-base/internal/tools"
    assert requests[0].headers["x-internal-service-token"] == "test-internal-token"
    assert requests[0].headers["x-correlation-id"] == "cor_test"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status_code", "body", "expected_code"),
    [
        (401, {"code": "UNAUTHORIZED"}, "UNAUTHORIZED"),
        (502, {"code": "UPSTREAM_UNAVAILABLE"}, "UPSTREAM_UNAVAILABLE"),
        (502, "not-json", "INVALID_GATEWAY_RESPONSE"),
        (200, {"data": {"items": []}}, "INVALID_TOOL_REGISTRY"),
        (200, {"data": ["not-a-tool"]}, "INVALID_TOOL_REGISTRY"),
    ],
)
async def test_registry_status_or_invalid_response_is_gateway_error(
    status_code: int,
    body: object,
    expected_code: str,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if isinstance(body, str):
            return httpx.Response(status_code, text=body)
        return httpx.Response(status_code, json=body)

    gateway, http_client = make_client(handler)
    try:
        with pytest.raises(GatewayToolError) as error:
            await gateway.registry("cor_test")
    finally:
        await http_client.aclose()

    assert error.value.code == expected_code


@pytest.mark.asyncio
async def test_registry_network_failure_is_gateway_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    gateway, http_client = make_client(handler)
    try:
        with pytest.raises(GatewayToolError) as error:
            await gateway.registry("cor_test")
    finally:
        await http_client.aclose()

    assert error.value.code == "UPSTREAM_UNAVAILABLE"


@pytest.mark.asyncio
async def test_failed_registry_response_is_not_cached() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(503, json={"code": "UPSTREAM_UNAVAILABLE"})
        return httpx.Response(200, json={"data": [{"name": "search_food"}]})

    gateway, http_client = make_client(handler)
    try:
        with pytest.raises(GatewayToolError):
            await gateway.registry("cor_first")
        assert await gateway.registry("cor_second") == [{"name": "search_food"}]
    finally:
        await http_client.aclose()

    assert calls == 2


@pytest.mark.asyncio
async def test_successful_registry_is_cached_within_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"data": [{"name": "search_food"}]})

    monkeypatch.setattr(
        gateway_module,
        "get_settings",
        lambda: SimpleNamespace(tool_registry_ttl_seconds=60),
    )
    gateway, http_client = make_client(handler)
    try:
        assert await gateway.registry("cor_first") == [{"name": "search_food"}]
        assert await gateway.registry("cor_second") == [{"name": "search_food"}]
    finally:
        await http_client.aclose()

    assert calls == 1
