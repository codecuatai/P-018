"""Unit tests for the external MCP client (Streamable HTTP JSON-RPC)."""

import json

import httpx
import pytest
from src.services.mcp_client.client import McpClient, McpClientError
from src.services.mcp_client.registry import McpConfigRegistry, McpExternalConfig
from src.services.mcp_client.router import ExternalMcpRouter


def _mock_transport(handler):
    def _handle(request: httpx.Request) -> httpx.Response:
        return handler(request)

    return httpx.MockTransport(_handle)


@pytest.mark.asyncio
async def test_mcp_client_initialize_and_list_tools_cached():
    calls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode())
        if body.get("method") == "initialize":
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": body.get("id"), "result": {"protocolVersion": "2024-11-05"}},
                headers={"Mcp-Session-Id": "mcp_test_session"},
            )
        if body.get("method") == "tools/list":
            calls["count"] += 1
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": body.get("id"), "result": {"tools": [{"name": "hospital.get_slots"}]}},
            )
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": body.get("id"), "result": {}})

    transport = _mock_transport(handler)
    client = McpClient(base_url="http://partner.test", transport=transport)
    init_result = await client.initialize()
    assert init_result["protocolVersion"] == "2024-11-05"
    assert client.session_id == "mcp_test_session"

    first = await client.list_tools()
    second = await client.list_tools()  # cached, no second HTTP call
    assert first == [{"name": "hospital.get_slots"}]
    assert second == first
    assert calls["count"] == 1
    await client.close()


@pytest.mark.asyncio
async def test_mcp_client_call_tool_success_and_error():
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode())
        if body.get("method") == "initialize":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": body.get("id"), "result": {}})
        params = body.get("params", {})
        if params.get("name") == "bad.tool":
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": body.get("id"), "error": {"code": -32601, "message": "Method not found"}},
            )
        return httpx.Response(
            200,
            json={"jsonrpc": "2.0", "id": body.get("id"), "result": {"content": [{"type": "text", "text": "ok"}]}},
        )

    transport = _mock_transport(handler)
    client = McpClient(base_url="http://partner.test", transport=transport)
    result = await client.call_tool("hospital.get_slots", {"date": "2026-09-10"})
    assert result["content"][0]["text"] == "ok"

    with pytest.raises(McpClientError):
        await client.call_tool("bad.tool", {})
    await client.close()


def test_registry_allowlist_behaviour():
    registry = McpConfigRegistry()
    registry.register(
        McpExternalConfig(
            provider_id="hospital-a",
            mcp_url="http://hospital-a.test",
            enabled=True,
            allowed_tools=["hospital.get_slots"],
        )
    )
    assert registry.is_tool_allowed("hospital-a", "hospital.get_slots") is True
    assert registry.is_tool_allowed("hospital-a", "other.tool") is False

    # Empty allowlist means all tools permitted
    registry.register(McpExternalConfig(provider_id="chain-b", mcp_url="http://chain-b.test"))
    assert registry.is_tool_allowed("chain-b", "anything.at_all") is True

    # Disabled provider blocks everything
    registry.register(McpExternalConfig(provider_id="off-c", mcp_url="http://off.test", enabled=False))
    assert registry.is_tool_allowed("off-c", "anything.at_all") is False


@pytest.mark.asyncio
async def test_router_fallback_when_external_unavailable():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    transport = _mock_transport(handler)
    registry = McpConfigRegistry()
    registry.register(McpExternalConfig(provider_id="hospital-a", mcp_url="http://hospital-a.test"))
    router = ExternalMcpRouter(registry=registry)

    # Monkeypatch McpClient creation to inject mock transport
    import src.services.mcp_client.router as router_module

    real_client_cls = router_module.McpClient

    class PatchedClient(real_client_cls):
        def __init__(self, base_url: str, api_key=None, timeout: float = 15.0, transport=None):
            super().__init__(base_url, api_key, timeout, transport=transport)

    router_module.McpClient = lambda base_url, api_key=None, timeout=15.0: PatchedClient(  # type: ignore
        base_url, api_key, timeout, transport=transport
    )
    try:
        result = await router.call_external_tool("hospital-a", "hospital.get_slots", {})
    finally:
        router_module.McpClient = real_client_cls

    assert result["source"] == "external-mcp"
    assert result["fallback"] == "external_unavailable"


@pytest.mark.asyncio
async def test_router_rejects_tool_not_in_allowlist():
    registry = McpConfigRegistry()
    registry.register(
        McpExternalConfig(
            provider_id="hospital-a",
            mcp_url="http://hospital-a.test",
            allowed_tools=["hospital.get_slots"],
        )
    )
    router = ExternalMcpRouter(registry=registry)
    result = await router.call_external_tool("hospital-a", "forbidden.tool", {})
    assert result["fallback"] == "tool_not_allowed"
    assert result["source"] == "external-mcp"
