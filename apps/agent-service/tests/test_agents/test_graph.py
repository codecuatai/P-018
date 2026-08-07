import pytest
from src.agents.graph import agent


@pytest.mark.asyncio
async def test_agent_basic_flow():
    result = await agent.ainvoke({"query": "Hello"})
    assert "response" in result


@pytest.mark.asyncio
async def test_agent_state_structure():
    result = await agent.ainvoke({"query": "Test query"})
    assert isinstance(result, dict)
    assert "query" in result


@pytest.mark.asyncio
async def test_restaurant_booking_without_required_slots_asks_for_input():
    result = await agent.ainvoke({"query": "Mình muốn đặt bàn nhà hàng", "workflow_id": "wf-test-1", "context": {}})
    assert result["intent"] == "restaurant_booking"
    assert result["status"] == "NEEDS_INPUT"
    assert "party_size" in result["missing_slots"]
    assert "local_date" in result["missing_slots"]


@pytest.mark.asyncio
async def test_restaurant_booking_emits_read_tool_request():
    result = await agent.ainvoke({"query": "Đặt bàn cho 2 người lúc 19 giờ", "workflow_id": "wf-test-2", "context": {}})
    assert result["status"] == "NEEDS_INPUT"
    assert "local_date" in result["missing_slots"]


@pytest.mark.asyncio
async def test_complete_restaurant_request_emits_read_tool_request():
    result = await agent.ainvoke({"query": "Dat ban cho 2 nguoi ngay mai luc 19h o Ha Noi", "workflow_id": "wf-test-3", "context": {}})
    assert result["status"] == "TOOL_REQUEST_READY"
    assert result["tool_request"]["tool_name"] == "restaurant.search"
    assert result["tool_request"]["risk_level"] == "READ"
    assert result["tool_request"]["workflow_id"] == "wf-test-3"
