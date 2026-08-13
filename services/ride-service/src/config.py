from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Service configuration loaded only from process environment."""

    model_config = SettingsConfigDict(extra="ignore")
    app_env: str = "development"
    service_port: int
    database_url: str
    internal_service_token: str
    tracking_time_scale: float = Field(default=1.0, gt=0.0, le=120.0)

    @model_validator(mode="after")
    def reject_accelerated_tracking_in_production(self) -> "Settings":
        if self.app_env.lower() in {"production", "prod"} and self.tracking_time_scale != 1.0:
            raise ValueError("TRACKING_TIME_SCALE must remain 1.0 in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
