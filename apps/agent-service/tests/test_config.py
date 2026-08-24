import pytest
from pydantic import ValidationError
from src.config import Settings, get_settings


def test_service_config_reads_process_environment() -> None:
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.service_port == 8001
    assert settings.database_url.endswith("/xone_agent")
    assert settings.agent_persistence_mode == "memory"


def test_service_config_fails_when_token_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INTERNAL_SERVICE_TOKEN")
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        get_settings()


def test_langfuse_is_optional_with_exactly_three_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "")
    monkeypatch.setenv("LANGFUSE_BASE_URL", "https://us.cloud.langfuse.com")

    settings = Settings()

    assert settings.langfuse_configured is False
    assert settings.langfuse_base_url == "https://us.cloud.langfuse.com"


def test_langfuse_requires_a_complete_key_pair(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "test-secret")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "")

    with pytest.raises(ValidationError, match="both public and secret keys"):
        Settings()


def test_langfuse_rejects_credentialed_or_insecure_base_urls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "test-secret")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "test-public")

    for base_url in (
        "http://us.cloud.langfuse.com",
        "https://user:password@us.cloud.langfuse.com",
        "https://us.cloud.langfuse.com?token=value",
    ):
        monkeypatch.setenv("LANGFUSE_BASE_URL", base_url)
        with pytest.raises(ValidationError, match="credential-free HTTPS URL"):
            Settings()
