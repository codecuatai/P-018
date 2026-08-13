import pytest
from pydantic import ValidationError
from src.config import get_settings
from src.infrastructure.database import sqlalchemy_database_url


def test_service_config_reads_process_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SERVICE_PORT", "8101")
    monkeypatch.setenv("DATABASE_URL", "postgresql://ride_user:test-password@postgres:5432/xone_ride")
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "test-token")
    get_settings.cache_clear()
    assert get_settings().service_port == 8101


def test_service_config_fails_when_token_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INTERNAL_SERVICE_TOKEN", raising=False)
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        get_settings()


def test_tracking_time_scale_is_allowed_for_local_e2e(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("TRACKING_TIME_SCALE", "60")
    get_settings.cache_clear()
    assert get_settings().tracking_time_scale == 60


def test_tracking_time_scale_is_rejected_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("TRACKING_TIME_SCALE", "2")
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        get_settings()


def test_postgresql_url_selects_declared_psycopg_driver() -> None:
    source = "postgresql://ride_user:password@postgres:5432/xone_ride"
    assert sqlalchemy_database_url(source) == (
        "postgresql+psycopg://ride_user:password@postgres:5432/xone_ride"
    )
