from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Service configuration loaded only from process environment."""

    model_config = SettingsConfigDict(extra="ignore")
    app_env: Literal["development", "production", "test"]
    service_port: int = Field(ge=1, le=65535)
    database_url: str = Field(min_length=1)
    internal_service_token: str = Field(min_length=1)
    persistence: Literal["postgres", "memory"]
    delivery_base_fee: int = Field(default=15000, ge=0)
    delivery_per_km_fee: int = Field(default=5000, ge=0)
    delivery_minimum_fee: int = Field(default=15000, ge=0)
    delivery_max_distance_km: float = Field(default=15.0, gt=0)
    delivery_long_distance_threshold_km: float = Field(default=5.0, ge=0)
    delivery_long_distance_surcharge: int = Field(default=5000, ge=0)
    delivery_eta_minutes: int = Field(default=35, ge=1)
    restaurant_rejection_rate: float = Field(default=0.05, ge=0, le=1)
    restaurant_confirm_delay_ms: int = Field(
        default=3000,
        ge=0,
        validation_alias=AliasChoices("FOOD_RESTAURANT_CONFIRM_DELAY_MS", "RESTAURANT_CONFIRM_DELAY_MS"),
    )
    preparing_delay_ms: int = Field(
        default=5000, ge=0, validation_alias=AliasChoices("FOOD_PREPARING_DELAY_MS", "PREPARING_DELAY_MS")
    )
    ready_for_pickup_delay_ms: int = Field(
        default=3000, ge=0, validation_alias=AliasChoices("FOOD_READY_FOR_PICKUP_DELAY_MS", "READY_FOR_PICKUP_DELAY_MS")
    )
    driver_assign_delay_ms: int = Field(
        default=3000, ge=0, validation_alias=AliasChoices("FOOD_DRIVER_ASSIGN_DELAY_MS", "DRIVER_ASSIGN_DELAY_MS")
    )
    pickup_delay_ms: int = Field(
        default=3000, ge=0, validation_alias=AliasChoices("FOOD_PICKUP_DELAY_MS", "PICKUP_DELAY_MS")
    )
    delivery_delay_ms: int = Field(
        default=5000, ge=0, validation_alias=AliasChoices("FOOD_DELIVERY_DELAY_MS", "DELIVERY_DELAY_MS")
    )
    workflow_poll_interval_ms: int = Field(
        default=500, ge=20, validation_alias=AliasChoices("FOOD_WORKFLOW_POLL_INTERVAL_MS", "WORKFLOW_POLL_INTERVAL_MS")
    )
    workflow_worker_enabled: bool = Field(
        default=True, validation_alias=AliasChoices("FOOD_WORKFLOW_WORKER_ENABLED", "WORKFLOW_WORKER_ENABLED")
    )
    workflow_step_delay_ms: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_runtime_mode(self) -> "Settings":
        if self.app_env == "production" and self.persistence != "postgres":
            raise ValueError("Production Food Service requires PERSISTENCE=postgres.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
