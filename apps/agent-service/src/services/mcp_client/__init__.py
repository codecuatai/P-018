"""External MCP client package for calling partner MCP servers."""

from src.services.mcp_client.client import CLIENT_INFO, PROTOCOL_VERSION, McpClient, McpClientError
from src.services.mcp_client.registry import McpConfigRegistry, McpExternalConfig, get_mcp_config_registry
from src.services.mcp_client.router import ExternalMcpRouter, get_external_mcp_router

__all__ = [
    "CLIENT_INFO",
    "PROTOCOL_VERSION",
    "McpClient",
    "McpClientError",
    "McpConfigRegistry",
    "McpExternalConfig",
    "get_mcp_config_registry",
    "ExternalMcpRouter",
    "get_external_mcp_router",
]
