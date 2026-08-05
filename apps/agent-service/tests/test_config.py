import pytest
from pydantic import ValidationError

from src.config import get_settings


def test_service_config_reads_process_environment() -> None:
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.service_port == 8001
    assert settings.database_url.endswith("/xone_agent")


def test_service_config_fails_when_token_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INTERNAL_SERVICE_TOKEN")
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        get_settings()
