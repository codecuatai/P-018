from functools import lru_cache
from typing import Literal

from pydantic import Field
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
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_fallback_model: str = "gemini-3.1-flash-lite"
    llm_temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    api_gateway_internal_url: str = "http://localhost:3000"
    tool_registry_ttl_seconds: int = Field(default=60, ge=1)
    max_graph_steps: int = Field(default=12, ge=1, le=20)
    max_tool_calls: int = Field(default=6, ge=1, le=10)
    # Gemini is the demo path. Tests and offline development can explicitly opt
    # into deterministic mode without changing the production/demo default.
    agent_model_mode: Literal["deterministic", "gemini"] = "gemini"

    # Database
    database_url: str = Field(min_length=1)
    internal_service_token: str = Field(min_length=1)


@lru_cache
def get_settings() -> Settings:
    return Settings()
