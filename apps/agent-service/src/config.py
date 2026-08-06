from functools import lru_cache
from typing import Literal
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent

class Settings(BaseSettings):
    """Service configuration loaded from env."""

    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "X-One Agent Service"
    app_env: Literal["development", "production", "test"] = "development"
    service_port: int = Field(default=8001, ge=1, le=65535)
    app_host: str = "0.0.0.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    cors_origins: str = "http://localhost:3000"
    internal_service_token: str = "local-token"

    # LLM adapter configuration
    google_api_key: str = ""
    model_name: str = "gemini-3.1-flash-lite"
    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)


@lru_cache
def get_settings() -> Settings:
    return Settings()
