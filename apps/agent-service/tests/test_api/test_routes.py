import pytest


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["status"] == "live"


@pytest.mark.asyncio
async def test_chat_empty_message(client):
    response = await client.post("/api/v1/chat", json={"message": ""})
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_agent_status(client):
    response = await client.get("/api/v1/status", headers={"x-internal-service-token": "test-token"})
    assert response.status_code == 200
