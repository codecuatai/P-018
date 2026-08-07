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

    # LLM adapter configuration. The skeleton does not call an LLM by default.
    gemini_api_key: str = Field(min_length=1)
    gemini_model: str = Field(min_length=1)
    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    agent_model_mode: Literal["deterministic", "gemini"] = "deterministic"

    # Database
    database_url: str = Field(min_length=1)
    internal_service_token: str = Field(min_length=1)


@lru_cache
def get_settings() -> Settings:
    return Settings()
