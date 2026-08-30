"""Shared helpers for the cross-service Compose E2E suites.

This module is imported with a plain absolute import (`from _helpers import ...`).
pytest's default `prepend` import mode inserts this directory on `sys.path`
because `tests/e2e` has no `__init__.py`, so a relative import such as
`from .conftest import ...` would fail with
"attempted relative import with no known parent package".
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import httpx

GATEWAY_URL = os.getenv("E2E_GATEWAY_URL")
DEMO_EMAIL = os.getenv("E2E_DEMO_EMAIL", "demo@example.invalid")
DEMO_PASSWORD = os.getenv("E2E_DEMO_PASSWORD", "replace-with-local-demo-password")

REPO_ROOT = Path(__file__).resolve().parents[2]

# These suites reach into the running stack (`docker compose exec`/`restart`), so the
# project name and env file must match the stack under test or the helpers would talk
# to a different set of containers than the Gateway the tests are calling.
COMPOSE_PROJECT_NAME = os.getenv("E2E_COMPOSE_PROJECT_NAME", "p-018")
COMPOSE_ENV_FILE = os.getenv("E2E_COMPOSE_ENV_FILE", ".env.example")


def compose_args(*args: str) -> list[str]:
    """Build a `docker compose` argv aimed at the stack under test."""
    return ["docker", "compose", "-p", COMPOSE_PROJECT_NAME, "--env-file", COMPOSE_ENV_FILE, *args]

# Access tokens are reused so a full-suite run does not trip the Gateway's
# per-IP login limiter. The TTL keeps a long run from carrying an expired token.
TOKEN_TTL_SECONDS = int(os.getenv("E2E_TOKEN_TTL_SECONDS", "600"))

_TOKEN_CACHE: dict[str, tuple[str, float]] = {}


def get_cached_token(
    client: httpx.Client,
    email: str = DEMO_EMAIL,
    password: str = DEMO_PASSWORD,
) -> str:
    """Return a cached access token for `email`, logging in only when needed."""
    cache_key = f"{client.base_url}:{email}"
    cached = _TOKEN_CACHE.get(cache_key)
    if cached is not None:
        token, issued_at = cached
        if time.monotonic() - issued_at < TOKEN_TTL_SECONDS:
            return token
        del _TOKEN_CACHE[cache_key]

    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    response.raise_for_status()
    token = str(response.json()["data"]["access_token"])
    _TOKEN_CACHE[cache_key] = (token, time.monotonic())
    return token


def invalidate_token_cache(client: httpx.Client | None = None) -> None:
    """Drop cached tokens for one client, or all of them when `client` is None."""
    if client is None:
        _TOKEN_CACHE.clear()
        return
    prefix = f"{client.base_url}:"
    for key in [key for key in _TOKEN_CACHE if key.startswith(prefix)]:
        del _TOKEN_CACHE[key]
