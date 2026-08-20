import os
from unittest.mock import AsyncMock

import langchain
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SERVICE_PORT", "8001")
os.environ.setdefault("DATABASE_URL", "postgresql://agent_user:test-password@postgres:5432/xone_agent")
os.environ.setdefault("AGENT_PERSISTENCE_MODE", "memory")
os.environ.setdefault("GEMINI_API_KEY", "test-key")
os.environ.setdefault("GEMINI_MODEL", "test-model")
os.environ.setdefault("AGENT_MODEL_MODE", "deterministic")
os.environ.setdefault("INTERNAL_SERVICE_TOKEN", "test-token")

if not hasattr(langchain, "debug"):
    langchain.debug = False

from src.main import app


@pytest_asyncio.fixture
async def client():
    """Async HTTP client for testing API endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def mock_llm():
    """Mock LLM to avoid calling OpenAI during tests.

    Usage in test:
        def test_something(mock_llm):
            # LLM calls will return mock response instead of hitting OpenAI
            ...
    """
    mock = AsyncMock()
    mock.ainvoke.return_value = AsyncMock(content="Mocked LLM response")
    return mock
