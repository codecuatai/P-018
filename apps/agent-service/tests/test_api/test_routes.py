import pytest


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["status"] == "live"


@pytest.mark.asyncio
async def test_chat_empty_message(client):
    response = await client.post("/api/v1/chat", json={"message": ""}, headers={"X-Internal-Service-Token": "test-token"})
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_agent_status(client):
    response = await client.get("/api/v1/status", headers={"X-Internal-Service-Token": "test-token"})
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_chat_returns_typed_tool_request(client):
    response = await client.post("/api/v1/chat", json={"message": "Đặt bàn cho 2 người lúc 19 giờ", "workflow_id": "wf-api-1"}, headers={"X-Internal-Service-Token": "test-token"})
    assert response.status_code == 200
    data = response.json()
    assert data["workflow_id"] == "wf-api-1"
    assert data["status"] == "NEEDS_INPUT"
    assert "local_date" in data["missing_slots"]
    assert data["tool_request"] is None


@pytest.mark.asyncio
async def test_chat_requires_internal_auth(client):
    response = await client.post("/api/v1/chat", json={"message": "Hello"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_chat_merges_follow_up_turns(client):
    headers = {"X-Internal-Service-Token": "test-token", "X-Actor-Id": "usr-test"}
    workflow_id = "wf-multi-turn"
    first = await client.post("/api/v1/chat", json={"message": "đặt bàn", "workflow_id": workflow_id}, headers=headers)
    assert first.json()["missing_slots"][0] == "party_size"
    second = await client.post("/api/v1/chat", json={"message": "1 người", "workflow_id": workflow_id}, headers=headers)
    assert second.json()["missing_slots"][0] == "local_date"
    third = await client.post("/api/v1/chat", json={"message": "9h30", "workflow_id": workflow_id}, headers=headers)
    assert third.json()["missing_slots"][0] == "local_date"
    fourth = await client.post("/api/v1/chat", json={"message": "ngày mai", "workflow_id": workflow_id}, headers=headers)
    assert fourth.json()["missing_slots"][0] == "location"
    fifth = await client.post("/api/v1/chat", json={"message": "Hà Nội", "workflow_id": workflow_id}, headers=headers)
    assert fifth.json()["status"] == "TOOL_REQUEST_READY"
    assert fifth.json()["tool_request"]["tool_name"] == "restaurant.search"
