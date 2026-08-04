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
        default="sqlite+aiosqlite:///./payment.db",
        validation_alias=AliasChoices("PAYMENT_DATABASE_URL", "DATABASE_URL"),
    )
