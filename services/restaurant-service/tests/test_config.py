import pytest
from pydantic import ValidationError

from src.config import get_settings


def test_service_config_reads_process_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SERVICE_PORT", "8102")
    monkeypatch.setenv("DATABASE_URL", "postgresql://restaurant_user:test-password@postgres:5432/xone_restaurant")
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "test-token")
    get_settings.cache_clear()
    assert get_settings().service_port == 8102


def test_service_config_fails_when_token_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INTERNAL_SERVICE_TOKEN", raising=False)
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        get_settings()
