---
title: "Writing Tests"
description: "Cách viết tests cho agent và API"
weight: 1
---

## Test Structure

```
tests/
├── conftest.py           ← Fixtures dùng chung
├── test_agents/
│   └── test_graph.py     ← Test agent flow
└── test_api/
    └── test_routes.py    ← Test API endpoints
```

## API Tests

```python
import pytest

@pytest.mark.asyncio
async def test_chat_endpoint(client):
    response = await client.post(
        "/api/v1/chat",
        json={"message": "Hello"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "response" in data

@pytest.mark.asyncio
async def test_empty_message_rejected(client):
    response = await client.post(
        "/api/v1/chat",
        json={"message": ""}
    )
    assert response.status_code == 422
```

## Agent Tests

```python
@pytest.mark.asyncio
async def test_agent_returns_response():
    result = await agent.ainvoke({"query": "test query"})
    assert "response" in result
    assert len(result["response"]) > 0

@pytest.mark.asyncio
async def test_agent_handles_empty_query():
    result = await agent.ainvoke({"query": ""})
    assert "error" in result or "response" in result
```

## Fixtures (conftest.py)

```python
import pytest
from httpx import ASGITransport, AsyncClient
from src.main import app

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test"
    ) as ac:
        yield ac
```

## Run Tests

```bash
# Run all
pytest tests/ -v

# Specific file
pytest tests/test_api/test_routes.py -v

# With coverage
pytest tests/ --cov=src --cov-report=term-missing
```

## Minimum Requirements

- Tối thiểu **3 test cases** cho API
- Tối thiểu **2 test cases** cho Agent
- Tất cả tests phải pass trước khi push
