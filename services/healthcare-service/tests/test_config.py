import pytest
from pydantic import ValidationError
from src.api.routes import _fold_department_name
from src.config import get_settings
from src.database import sqlalchemy_database_url


def test_postgres_url_uses_installed_psycopg_driver() -> None:
    assert sqlalchemy_database_url("postgresql://user:password@postgres:5432/xone_healthcare") == (
        "postgresql+psycopg://user:password@postgres:5432/xone_healthcare"
    )


def test_department_lookup_folds_accents() -> None:
    assert _fold_department_name("Khoa Khám bệnh") == "khoa kham benh"
    assert _fold_department_name("Kham benh") in _fold_department_name("Khoa Khám bệnh")


def test_service_config_reads_process_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SERVICE_PORT", "8103")
    monkeypatch.setenv("DATABASE_URL", "postgresql://healthcare_user:test-password@postgres:5432/xone_healthcare")
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "test-token")
    get_settings.cache_clear()
    assert get_settings().service_port == 8103


def test_service_config_fails_when_token_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INTERNAL_SERVICE_TOKEN", raising=False)
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        get_settings()
