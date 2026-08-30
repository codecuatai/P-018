"""pytest fixtures and strictness hooks for the cross-service Compose E2E suites."""

from __future__ import annotations

import os
from collections.abc import Iterator

import httpx
import pytest

from _helpers import (
    DEMO_EMAIL,
    DEMO_PASSWORD,
    GATEWAY_URL,
    get_cached_token,
    invalidate_token_cache,
)

__all__ = ["DEMO_EMAIL", "DEMO_PASSWORD", "GATEWAY_URL", "auth_token", "get_cached_token"]


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def pytest_configure(config: pytest.Config) -> None:
    """Refuse to turn a missing Gateway URL into a silent skip.

    `local-acceptance.ps1` sets `E2E_REQUIRE_GATEWAY=1`, so an acceptance run can
    never report success for a suite that skipped every test.
    """
    if _is_truthy(os.getenv("E2E_REQUIRE_GATEWAY")) and not GATEWAY_URL:
        raise pytest.UsageError(
            "E2E_REQUIRE_GATEWAY is set but E2E_GATEWAY_URL is empty. "
            "A skipped cross-service E2E run is not an acceptance pass."
        )


@pytest.fixture(scope="session", autouse=True)
def _clear_token_cache_after_session() -> Iterator[None]:
    """Drop cached access tokens once the session ends."""
    yield
    invalidate_token_cache()


@pytest.fixture
def auth_token() -> str:
    assert GATEWAY_URL, "E2E_GATEWAY_URL must be configured"
    with httpx.Client(base_url=GATEWAY_URL, timeout=30) as client:
        return get_cached_token(client)
