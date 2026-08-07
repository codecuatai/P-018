from __future__ import annotations

import time
from typing import Any

import httpx

from src.config import get_settings


class GatewayToolError(RuntimeError):
    def __init__(self, code: str, message: str = "Gateway tool request failed") -> None:
        super().__init__(message)
        self.code = code


class GatewayToolClient:
    def __init__(self, base_url: str | None = None, token: str | None = None, client: httpx.AsyncClient | None = None) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.api_gateway_internal_url).rstrip("/")
        self.token = token or settings.internal_service_token
        self.client = client
        self._registry: list[dict[str, Any]] = []
        self._registry_loaded_at = 0.0

    async def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None,
        correlation_id: str,
        actor_id: str | None = None,
        unwrap_list: bool = False,
    ) -> Any:
        own_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=10.0)
        try:
            headers = {"x-internal-service-token": self.token, "x-correlation-id": correlation_id}
            if actor_id:
                headers["x-actor-id"] = actor_id
            response = await client.request(method, f"{self.base_url}{path}", json=payload, headers=headers)
            try:
                body = response.json()
            except ValueError as exc:
                raise GatewayToolError("INVALID_GATEWAY_RESPONSE") from exc
            if response.status_code >= 400:
                detail = body.get("code") if isinstance(body, dict) else None
                if not detail and isinstance(body, dict) and isinstance(body.get("detail"), dict):
                    detail = body["detail"].get("code")
                raise GatewayToolError(str(detail or "UPSTREAM_UNAVAILABLE"))
            data = body.get("data") if isinstance(body, dict) else None
            return data if isinstance(data, dict) or (unwrap_list and isinstance(data, list)) else {"items": data}
        except httpx.TimeoutException as exc:
            raise GatewayToolError("TOOL_TIMEOUT") from exc
        except httpx.HTTPError as exc:
            raise GatewayToolError("UPSTREAM_UNAVAILABLE") from exc
        finally:
            if own_client:
                await client.aclose()

    async def registry(self, correlation_id: str) -> list[dict[str, Any]]:
        settings = get_settings()
        if self._registry and time.monotonic() - self._registry_loaded_at < settings.tool_registry_ttl_seconds:
            return self._registry
        data = await self._request("GET", "/internal/tools", None, correlation_id, unwrap_list=True)
        if not isinstance(data, list) or any(not isinstance(tool, dict) for tool in data):
            raise GatewayToolError("INVALID_TOOL_REGISTRY")
        self._registry = list(data)
        self._registry_loaded_at = time.monotonic()
        return self._registry

    async def execute(self, name: str, arguments: dict[str, Any], user_id: str, correlation_id: str, conversation_id: str | None = None) -> dict[str, Any]:
        tools = await self.registry(correlation_id)
        definition = next((tool for tool in tools if tool.get("name") == name), None)
        if definition is None:
            raise GatewayToolError("TOOL_NOT_FOUND")
        if definition.get("permission") not in {"read", "draft_write", "preview", "confirmation_prepare"}:
            raise GatewayToolError("TOOL_NOT_ALLOWED")
        return await self._request("POST", "/internal/tools/execute", {"name": name, "arguments": arguments, "actor_id": user_id, "conversation_id": conversation_id}, correlation_id, user_id)
