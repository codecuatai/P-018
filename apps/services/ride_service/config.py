from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_env_file() -> Path:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / ".env"
        if candidate.exists():
            return candidate
    return Path.cwd() / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_find_env_file(), env_file_encoding="utf-8", extra="ignore")
    database_url: str = Field(
        default="sqlite+aiosqlite:///./ride.db",
        validation_alias=AliasChoices("RIDE_DATABASE_URL", "DATABASE_URL"),
    )
    payment_service_url: str = Field(default="http://127.0.0.1:8001", validation_alias="PAYMENT_SERVICE_URL")
    geoapify_api_key: str | None = Field(default=None, validation_alias="GEOAPIFY_API_KEY")
    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
        validation_alias="RIDE_CORS_ORIGINS",
    )
