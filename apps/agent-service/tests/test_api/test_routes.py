import pytest


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health/live")
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "live"


@pytest.mark.asyncio
async def test_chat_empty_message(client):
    response = await client.post(
        "/api/v1/chat", json={"message": ""}, headers={"X-Internal-Service-Token": "test-token"}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_chat_requires_real_actor_and_conversation(client):
    response = await client.post("/api/v1/chat", json={"message": "Tìm món ăn"})
    assert response.status_code == 422
    response = await client.post(
        "/api/v1/chat", json={"message": "Tìm món ăn", "user_id": "actor", "conversation_id": "conversation"}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_agent_status(client):
    response = await client.get("/api/v1/status", headers={"X-Internal-Service-Token": "test-token"})
    assert response.status_code == 200
    data = response.json()
    assert data["model_mode"] == "deterministic"
    assert data["model"] == "test-model"
    assert data["api_key_configured"] is True
    assert "gemini_api_key" not in data


@pytest.mark.asyncio
async def test_assistant_chat_returns_a_bounded_multi_domain_plan(client):
    response = await client.post(
        "/api/v1/assistant-chat",
        json={
            "message": "Tim pho giao ve nha va dat lich kham than kinh sang mai",
            "conversation_id": "conv-assistant-api-1",
            "user_id": "actor-assistant-api-1",
            "correlation_id": "corr-assistant-api-1",
        },
        headers={
            "X-Internal-Service-Token": "test-token",
            "X-Actor-Id": "actor-assistant-api-1",
        },
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["decision_source"] == "deterministic"
    assert [task["domain"] for task in data["plan"]["tasks"]] == ["food", "healthcare"]
    assert all("price" not in task.get("extracted_slots", {}) for task in data["plan"]["tasks"])
    assert all(
        step["step_kind"] == "CAPABILITY" for task in data["planning_decision"]["tasks"] for step in task["steps"]
    )


@pytest.mark.asyncio
async def test_assistant_chat_stream_returns_sse_events(client):
    response = await client.post(
        "/api/v1/assistant-chat/stream",
        json={
            "message": "Tim pho giao ve nha va dat lich kham than kinh sang mai",
            "conversation_id": "conv-assistant-stream-1",
            "user_id": "actor-assistant-stream-1",
            "correlation_id": "corr-assistant-stream-1",
        },
        headers={
            "X-Internal-Service-Token": "test-token",
            "X-Actor-Id": "actor-assistant-stream-1",
        },
    )
    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")
    content = response.text
    assert "event: status" in content
    assert "event: plan" in content
    assert "event: delta" in content
    assert "event: finish" in content


@pytest.mark.asyncio
async def test_assistant_chat_requires_gateway_auth(client):
    response = await client.post(
        "/api/v1/assistant-chat",
        json={"message": "Tim mon an", "conversation_id": "conv-auth", "user_id": "actor-auth"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_restaurant_chat_returns_typed_tool_request(client):
    response = await client.post(
        "/api/v1/restaurant-chat",
        json={"message": "Đặt bàn cho 2 người lúc 19 giờ", "workflow_id": "wf-api-1"},
        headers={"X-Internal-Service-Token": "test-token", "X-Actor-Id": "usr-test"},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["workflow_id"] == "wf-api-1"
    assert data["status"] == "NEEDS_INPUT"
    assert "local_date" in data["missing_slots"]
    assert data["tool_request"] is None


@pytest.mark.asyncio
async def test_restaurant_chat_requires_internal_auth(client):
    response = await client.post("/api/v1/restaurant-chat", json={"message": "Hello"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_restaurant_chat_merges_follow_up_turns(client):
    headers = {"X-Internal-Service-Token": "test-token", "X-Actor-Id": "usr-test"}
    workflow_id = "wf-multi-turn"
    first = await client.post(
        "/api/v1/restaurant-chat", json={"message": "đặt bàn", "workflow_id": workflow_id}, headers=headers
    )
    assert first.json()["data"]["missing_slots"][0] == "party_size"
    second = await client.post(
        "/api/v1/restaurant-chat", json={"message": "1 người", "workflow_id": workflow_id}, headers=headers
    )
    assert second.json()["data"]["missing_slots"][0] == "local_date"
    third = await client.post(
        "/api/v1/restaurant-chat", json={"message": "9h30", "workflow_id": workflow_id}, headers=headers
    )
    assert third.json()["data"]["missing_slots"][0] == "local_date"
    fourth = await client.post(
        "/api/v1/restaurant-chat", json={"message": "ngày mai", "workflow_id": workflow_id}, headers=headers
    )
    assert fourth.json()["data"]["missing_slots"][0] == "location"
    fifth = await client.post(
        "/api/v1/restaurant-chat", json={"message": "Hà Nội", "workflow_id": workflow_id}, headers=headers
    )
    assert fifth.json()["data"]["status"] == "TOOL_REQUEST_READY"
    assert fifth.json()["data"]["tool_request"]["tool_name"] == "restaurant.search"


@pytest.mark.asyncio
async def test_restaurant_chat_reuses_read_result_for_selection(client):
    headers = {"X-Internal-Service-Token": "test-token", "X-Actor-Id": "usr-selection"}
    workflow_id = "wf-selection-result"
    first = await client.post(
        "/api/v1/restaurant-chat",
        json={"message": "dat ban cho 2 nguoi ngay mai luc 19h o Ha Noi", "workflow_id": workflow_id},
        headers=headers,
    )
    first_data = first.json()["data"]
    assert first_data["tool_request"]["tool_name"] == "restaurant.search"

    grounded = await client.post(
        "/api/v1/restaurant-chat",
        json={
            "message": "dat ban cho 2 nguoi ngay mai luc 19h o Ha Noi",
            "workflow_id": workflow_id,
            "context": {
                "slots": first_data["slots"],
                "intent": first_data["intent"],
                "tool_name": "restaurant.search",
                "tool_result": {"items": [{"id": "r1", "name": "Pho Heritage"}], "total": 1},
                "tool_result_only": True,
            },
        },
        headers=headers,
    )
    assert grounded.json()["data"]["status"] == "COMPLETED"

    selected = await client.post(
        "/api/v1/restaurant-chat",
        json={"message": "chon pho heritage", "workflow_id": workflow_id},
        headers=headers,
    )
    selected_data = selected.json()["data"]
    assert selected_data["status"] == "TOOL_REQUEST_READY"
    assert selected_data["tool_request"]["tool_name"] == "restaurant.check_availability"
    assert selected_data["tool_request"]["arguments"]["restaurant_id"] == "r1"


@pytest.mark.asyncio
async def test_healthcare_chat_returns_typed_request_without_calling_domain(client):
    response = await client.post(
        "/api/v1/healthcare-chat",
        json={
            "message": "dat lich kham khoa than kinh",
            "workflow_id": "wf-healthcare-api-1",
            "context": {"patient_id": 1},
        },
        headers={"X-Internal-Service-Token": "test-token", "X-Actor-Id": "usr-test"},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["intent"] == "healthcare_booking"
    assert data["tool_request"]["tool_name"] == "healthcare.list_slots"
    assert data["tool_request"]["risk_level"] == "READ"


@pytest.mark.asyncio
async def test_healthcare_chat_requires_internal_auth(client):
    response = await client.post("/api/v1/healthcare-chat", json={"message": "dat lich kham"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_ride_chat_returns_typed_quote_request(client):
    response = await client.post(
        "/api/v1/ride-chat",
        json={
            "message": "from 1 Main Street to 2 Lake Road by car 4",
            "workflow_id": "wf-ride-agent-1",
        },
        headers={"X-Internal-Service-Token": "test-token"},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["intent"] == "request_ride_quote"
    assert data["tool_request"]["tool_name"] == "ride.quote.create"
    assert data["tool_request"]["risk_level"] == "READ"


@pytest.mark.asyncio
async def test_ride_chat_keeps_passenger_count_out_of_destination(client):
    response = await client.post(
        "/api/v1/ride-chat",
        json={
            "message": "Đặt xe 7 chỗ từ VinUni đến Hồ Gươm cho 4 người",
            "workflow_id": "wf-ride-passengers-1",
        },
        headers={"X-Internal-Service-Token": "test-token"},
    )

    assert response.status_code == 200
    arguments = response.json()["data"]["tool_request"]["arguments"]
    assert arguments["dropoff_address"] == "Hồ Gươm"
    assert arguments["vehicle_type"] == "CAR_7"
    assert arguments["passenger_count"] == 4
