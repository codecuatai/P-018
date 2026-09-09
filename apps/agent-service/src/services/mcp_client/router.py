"""Router deciding when to call external partner MCP servers."""

import logging
import os
from typing import Any

from src.services.mcp_client.client import McpClient, McpClientError
from src.services.mcp_client.registry import McpConfigRegistry, get_mcp_config_registry

logger = logging.getLogger(__name__)

# Intents that may be served by an external partner MCP server.
# Maps internal intent prefix -> hint for matching external tools.
EXTERNAL_INTENT_HINTS: dict[str, list[str]] = {
    "restaurant": ["restaurant_booking", "restaurant_search", "book_table", "dat_ban"],
    "healthcare": ["healthcare_booking", "healthcare_slots", "dat_lich_kham", "hoi_lich"],
    "food": ["search_food", "create_cart", "dat_mon"],
    "ride": ["request_ride_quote", "dat_xe"],
}


class ExternalMcpRouter:
    """Decide when to delegate to an external MCP and tag result source."""

    def __init__(self, registry: McpConfigRegistry | None = None) -> None:
        self._registry = registry or get_mcp_config_registry()

    def find_candidate(
        self,
        intent: str,
        provider_id: str | None = None,
    ) -> str | None:
        """Return provider_id of external MCP to use, or None for internal.

        If provider_id is given and registered+enabled, use it directly.
        Otherwise match intent prefix against registered configs is left to
        the caller (explicit routing keeps behaviour deterministic).
        """
        if provider_id:
            cfg = self._registry.get(provider_id)
            return cfg.provider_id if cfg else None
        return None

    def match_intent_domain(self, intent: str) -> str | None:
        """Infer domain from intent string for logging/routing hints."""
        normalized = (intent or "").lower()
        for domain, hints in EXTERNAL_INTENT_HINTS.items():
            if any(h in normalized for h in hints):
                return domain
        return None

    def _resolve_api_key(self, api_key_ref: str | None) -> str | None:
        if not api_key_ref:
            return None
        if api_key_ref.startswith("env:"):
            return os.environ.get(api_key_ref[4:], None)
        return api_key_ref

    async def list_external_tools(self, provider_id: str) -> dict[str, Any]:
        """List tools from external MCP, filtered by allowed_tools."""
        cfg = self._registry.get(provider_id)
        if not cfg:
            return {"provider_id": provider_id, "tools": [], "source": "external-mcp", "enabled": False}
        client = McpClient(base_url=cfg.mcp_url, api_key=self._resolve_api_key(cfg.api_key_ref))
        try:
            await client.initialize()
            tools = await client.list_tools()
        except McpClientError as exc:
            logger.warning("External MCP list_tools failed: %s", type(exc).__name__)
            return {
                "provider_id": provider_id,
                "tools": [],
                "source": "external-mcp",
                "enabled": True,
                "fallback": "external_unavailable",
            }
        finally:
            await client.close()
        if cfg.allowed_tools:
            tools = [t for t in tools if t.get("name") in cfg.allowed_tools]
        return {"provider_id": provider_id, "tools": tools, "source": "external-mcp", "enabled": True}

    async def call_external_tool(
        self,
        provider_id: str,
        tool_name: str,
        arguments: dict[str, Any],
        correlation_id: str | None = None,
    ) -> dict[str, Any]:
        """Call external MCP tool with allowlist check and fallback signal.

        Returns dict with `source: external-mcp` on success, or
        `fallback: external_unavailable|tool_not_allowed` so the caller
        can fall back to the internal service.
        """
        cfg = self._registry.get(provider_id)
        if not cfg:
            return {
                "source": "external-mcp",
                "fallback": "provider_not_configured",
                "provider_id": provider_id,
                "tool_name": tool_name,
            }
        if not self._registry.is_tool_allowed(provider_id, tool_name):
            return {
                "source": "external-mcp",
                "fallback": "tool_not_allowed",
                "provider_id": provider_id,
                "tool_name": tool_name,
            }
        client = McpClient(base_url=cfg.mcp_url, api_key=self._resolve_api_key(cfg.api_key_ref))
        try:
            await client.initialize()
            result = await client.call_tool(tool_name, arguments, correlation_id=correlation_id)
            return {
                "source": "external-mcp",
                "provider_id": provider_id,
                "tool_name": tool_name,
                "data": result,
            }
        except McpClientError as exc:
            logger.warning("External MCP call failed: %s", type(exc).__name__)
            return {
                "source": "external-mcp",
                "fallback": "external_unavailable",
                "provider_id": provider_id,
                "tool_name": tool_name,
                "error_code": "EXTERNAL_MCP_UNAVAILABLE",
            }
        except Exception:
            logger.exception("Unexpected external MCP failure")
            return {
                "source": "external-mcp",
                "fallback": "external_unavailable",
                "provider_id": provider_id,
                "tool_name": tool_name,
                "error_code": "EXTERNAL_MCP_UNAVAILABLE",
            }
        finally:
            await client.close()


_ROUTER = ExternalMcpRouter()


def get_external_mcp_router() -> ExternalMcpRouter:
    """Return the singleton ExternalMcpRouter instance."""
    return _ROUTER
