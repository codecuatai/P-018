from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = next((parent for parent in Path(__file__).resolve().parents if (parent / ".env").exists()), Path.cwd())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "AI20K Agent"
    app_env: Literal["development", "production", "test"] = "development"
    app_port: int = Field(default=8002, ge=1, le=65535)
    app_host: str = "0.0.0.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    cors_origins: str = "http://localhost:3000"

    # LLM (Groq is the default provider. The key may be blank in local mode.)
    groq_api_key: str = Field(default="", validation_alias=AliasChoices("GROQ_API_KEY", "OPENAI_API_KEY"))
    groq_model: str = "llama-3.3-70b-versatile"
    # OPENAI_API_KEY is also accepted as a migration alias for existing local env files.
    openai_api_key: str = ""
    model_name: str = "llama-3.3-70b-versatile"
    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)

    # The concierge calls Ride only; Ride owns the payment-service boundary.
    ride_service_url: str = "http://127.0.0.1:8000"
    api_timeout_seconds: float = Field(default=10.0, gt=0, le=60)
    service_retry_max_attempts: int = Field(default=3, ge=1, le=5)
    service_retry_base_delay_seconds: float = Field(default=0.25, ge=0, le=3)

    # Database
    database_url: str = "sqlite:///./data/app.db"

    # Vector Store
    chroma_persist_dir: str = "./data/chroma"


@lru_cache
def get_settings() -> Settings:
    return Settings()

