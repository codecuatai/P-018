from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Service configuration loaded only from process environment."""

    model_config = SettingsConfigDict(extra="ignore")
    service_port: int
    database_url: str
    internal_service_token: str


@lru_cache
def get_settings() -> Settings:
    return Settings()
