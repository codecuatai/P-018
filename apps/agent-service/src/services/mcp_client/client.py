"""Streamable HTTP MCP Client for connecting to external partner MCP servers."""

import logging
import time
from typing import Any
from uuid import uuid4

import httpx

logger = logging.getLogger(__name__)

PROTOCOL_VERSION = "2024-11-05"
CLIENT_INFO = {"name": "x-one-agent", "version": "1.0.0"}


class McpClientError(Exception):
    """Base exception for MCP Client communication errors."""

    def __init__(self, message: str, code: int | None = None, data: Any = None):
        super().__init__(message)
        self.code = code
        self.data = data


class McpClient:
    """Async MCP Client that connects over Streamable HTTP (JSON-RPC 2.0)."""

    def __init__(
        self,
        base_url: str,
        api_key: str | None = None,
        timeout: float = 15.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers=headers,
            timeout=self.timeout,
            transport=transport,
        )
        self.session_id: str | None = None
        self._tools_cache: list[dict[str, Any]] | None = None
        self._tools_cached_at: float = 0.0
        self._cache_ttl_seconds: float = 600.0  # 10 minutes

    async def __aenter__(self) -> "McpClient":
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.close()

    async def close(self) -> None:
        await self._client.aclose()

    async def _send_rpc(
        self,
        method: str,
        params: dict[str, Any] | None = None,
        correlation_id: str | None = None,
    ) -> dict[str, Any]:
        """Send a JSON-RPC 2.0 request and return the result dictionary."""
        rpc_id = uuid4().hex[:12]
        payload: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "method": method,
        }
        if params is not None:
            payload["params"] = params

        req_headers: dict[str, str] = {}
        if self.session_id:
            req_headers["Mcp-Session-Id"] = self.session_id
        if correlation_id:
            req_headers["X-Correlation-Id"] = correlation_id

        # Retry once on transient connection failure
        for attempt in range(2):
            try:
                response = await self._client.post(
                    "/mcp",
                    json=payload,
                    headers=req_headers,
                )
                break
            except (httpx.ConnectError, httpx.TimeoutException) as exc:
                if attempt == 0:
                    continue
                raise McpClientError(f"Network error connecting to MCP server: {exc}") from exc

        if response.status_code >= 400:
            raise McpClientError(
                f"MCP HTTP error {response.status_code}: {response.text[:300]}",
                code=response.status_code,
            )

        # Track session header if provided
        session_header = response.headers.get("mcp-session-id") or response.headers.get("Mcp-Session-Id")
        if session_header:
            self.session_id = session_header

        data = response.json()
        if "error" in data and data["error"]:
            err = data["error"]
            raise McpClientError(
                message=err.get("message", "Unknown JSON-RPC error"),
                code=err.get("code", -32603),
                data=err.get("data"),
            )

        return data.get("result", {})

    async def initialize(self) -> dict[str, Any]:
        """Handshake with the MCP server to establish session and capabilities."""
        result = await self._send_rpc(
            "initialize",
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": CLIENT_INFO,
            },
        )
        return result

    async def ping(self) -> bool:
        """Send a ping to verify connection."""
        try:
            await self._send_rpc("ping", {})
            return True
        except Exception:
            return False

    async def list_tools(self, force_refresh: bool = False) -> list[dict[str, Any]]:
        """List available tools with 10-minute caching."""
        now = time.time()
        if (
            not force_refresh
            and self._tools_cache is not None
            and (now - self._tools_cached_at) < self._cache_ttl_seconds
        ):
            return self._tools_cache

        result = await self._send_rpc("tools/list", {})
        tools = result.get("tools", [])
        self._tools_cache = tools
        self._tools_cached_at = now
        return tools

    async def call_tool(
        self,
        name: str,
        arguments: dict[str, Any],
        correlation_id: str | None = None,
    ) -> dict[str, Any]:
        """Invoke a tool and return the parsed response."""
        result = await self._send_rpc(
            "tools/call",
            {
                "name": name,
                "arguments": arguments,
            },
            correlation_id=correlation_id,
        )
        return result
