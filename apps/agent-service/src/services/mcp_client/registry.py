"""Registry of external partner MCP server configurations."""

import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class McpExternalConfig:
    """Configuration record for an external partner MCP endpoint."""

    provider_id: str
    mcp_url: str
    api_key_ref: str | None = None
    enabled: bool = True
    allowed_tools: list[str] = field(default_factory=list)
    created_at: str | None = None
    updated_at: str | None = None


class McpConfigRegistry:
    """Registry maintaining active external partner MCP configurations."""

    def __init__(self) -> None:
        self._configs: dict[str, McpExternalConfig] = {}

    def register(self, config: McpExternalConfig) -> None:
        """Register or update an external partner configuration."""
        self._configs[config.provider_id] = config

    def unregister(self, provider_id: str) -> bool:
        """Remove a configuration by provider_id."""
        return self._configs.pop(provider_id, None) is not None

    def get(self, provider_id: str) -> McpExternalConfig | None:
        """Get config for provider_id if present and enabled."""
        cfg = self._configs.get(provider_id)
        if cfg and cfg.enabled:
            return cfg
        return None

    def list_active(self) -> list[McpExternalConfig]:
        """List all active/enabled configurations."""
        return [c for c in self._configs.values() if c.enabled]

    def is_tool_allowed(self, provider_id: str, tool_name: str) -> bool:
        """Check if tool is in allowed_tools for this provider.

        If allowed_tools is empty, all tools are permitted by default.
        """
        cfg = self.get(provider_id)
        if not cfg:
            return False
        if not cfg.allowed_tools:
            return True
        return tool_name in cfg.allowed_tools


_REGISTRY = McpConfigRegistry()


def get_mcp_config_registry() -> McpConfigRegistry:
    """Return the singleton McpConfigRegistry instance."""
    return _REGISTRY
