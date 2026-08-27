from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Service configuration loaded only from process environment."""

    model_config = SettingsConfigDict(extra="ignore")

    # App
    app_name: str = "X-One Agent Service"
    app_env: Literal["development", "production", "test"]
    service_port: int = Field(ge=1, le=65535)
    app_host: str = "0.0.0.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    cors_origins: str = "http://localhost:3000"

    # LLM adapter configuration. Deterministic fallback is used when no key is configured.
    gemini_api_key: str = ""
    gemini_api_keys: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_fallback_model: str = "gemini-3.1-flash-lite"
    llm_temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    tool_registry_ttl_seconds: int = Field(default=60, ge=1)
    max_graph_steps: int = Field(default=12, ge=1, le=20)
    max_tool_calls: int = Field(default=6, ge=1, le=10)
    # Gemini is the demo path. Tests and offline development can explicitly opt
    # into deterministic mode without changing the production/demo default.
    agent_model_mode: Literal["deterministic", "gemini"] = "gemini"

    # Optional metadata-only Langfuse observability. The adapter auto-enables
    # only for a complete key pair and never captures prompt/response bodies.
    langfuse_secret_key: str = ""
    langfuse_public_key: str = ""
    langfuse_base_url: str = "https://us.cloud.langfuse.com"

    # Database
    database_url: str = Field(min_length=1)
    agent_persistence_mode: Literal["required_postgres", "memory"] = "required_postgres"
    internal_service_token: str = Field(min_length=1)
    api_gateway_url: str = ""
    gemini_key_cache_ttl_seconds: int = Field(default=30, ge=5, le=3600)

    @model_validator(mode="after")
    def resolve_api_gateway_url(self) -> "Settings":
        if not self.api_gateway_url.strip():
            # In Docker container (/.dockerenv exists), route to Docker service DNS 'http://api-gateway:3000'
            # In standalone/host local development, route to 'http://localhost:3000'
            in_docker = Path("/.dockerenv").exists()
            self.api_gateway_url = "http://api-gateway:3000" if in_docker else "http://localhost:3000"
        return self

    @model_validator(mode="after")
    def validate_langfuse_configuration(self) -> "Settings":
        public_configured = bool(self.langfuse_public_key.strip())
        secret_configured = bool(self.langfuse_secret_key.strip())
        if public_configured != secret_configured:
            raise ValueError("Langfuse requires both public and secret keys.")
        parsed = urlsplit(self.langfuse_base_url)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("LANGFUSE_BASE_URL must be a credential-free HTTPS URL.")
        return self

    @model_validator(mode="after")
    def sync_gemini_keys(self) -> "Settings":
        if not self.gemini_api_key.strip() and self.gemini_api_keys.strip():
            first_key = next((k.strip() for k in self.gemini_api_keys.split(",") if k.strip()), "")
            self.gemini_api_key = first_key
        return self

    @property
    def api_keys(self) -> list[str]:
        keys: list[str] = []
        if self.gemini_api_keys:
            for k in self.gemini_api_keys.split(","):
                k_clean = k.strip()
                if k_clean and k_clean not in keys:
                    keys.append(k_clean)
        if self.gemini_api_key:
            for k in self.gemini_api_key.split(","):
                k_clean = k.strip()
                if k_clean and k_clean not in keys:
                    keys.append(k_clean)
        return keys

    @property
    def has_gemini_api_key(self) -> bool:
        return len(self.api_keys) > 0

    @property
    def langfuse_configured(self) -> bool:
        return bool(self.langfuse_public_key.strip() and self.langfuse_secret_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
