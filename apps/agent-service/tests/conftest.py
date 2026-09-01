import os
from unittest.mock import AsyncMock

import langchain
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ["APP_ENV"] = "test"
os.environ["SERVICE_PORT"] = "8001"
os.environ["DATABASE_URL"] = "postgresql://agent_user:test-password@postgres:5432/xone_agent"

# Force isolated test behavior instead of inheriting local/prod config.
os.environ["AGENT_PERSISTENCE_MODE"] = "memory"
os.environ["AGENT_MODEL_MODE"] = "deterministic"

# Test-only model configuration.
os.environ["GEMINI_API_KEY"] = "test-key"
os.environ["GEMINI_MODEL"] = "test-model"

os.environ["INTERNAL_SERVICE_TOKEN"] = "test-token"

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
