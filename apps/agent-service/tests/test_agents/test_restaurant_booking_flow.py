import pytest

from src.agents.nodes.restaurant_node import classify_and_extract


@pytest.mark.asyncio
async def test_restaurant_selection_advances_to_availability_check():
    result = await classify_and_extract({
        "query": "cai thu nhat",
        "workflow_id": "wf-flow",
        "turn_id": "2",
        "intent": "restaurant_booking",
        "slots": {},
        "context": {
            "tool_name": "restaurant.search",
            "tool_result": {"data": {"items": [{"id": "r1", "name": "Pho Heritage"}]}},
            "slots": {
                "party_size": 3,
                "local_date": "2099-01-01",
                "local_time": "20:00",
                "start_at": "2099-01-01T20:00:00+07:00",
                "location": "Ha Noi",
            },
        },
    })

    assert result["tool_request"]["tool_name"] == "restaurant.check_availability"
    assert result["tool_request"]["arguments"]["restaurant_id"] == "r1"


@pytest.mark.asyncio
async def test_availability_confirmation_creates_hold_then_reservation():
    slots = {
        "restaurant_id": "r1",
        "party_size": 3,
        "local_date": "2099-01-01",
        "local_time": "20:00",
        "start_at": "2099-01-01T20:00:00+07:00",
        "location": "Ha Noi",
    }
    available = {
        "data": {"available": True, "restaurant_id": "r1"},
        "tool_name": "restaurant.check_availability",
        "slots": slots,
    }
    hold_request = await classify_and_extract({
        "query": "co",
        "workflow_id": "wf-flow",
        "turn_id": "3",
        "intent": "restaurant_booking",
        "slots": slots,
        "context": {"tool_result": available["data"], "tool_name": available["tool_name"], "slots": slots},
    })
    assert hold_request["tool_request"]["tool_name"] == "restaurant.create_hold"

    reservation_request = await classify_and_extract({
        "query": "xac nhan",
        "workflow_id": "wf-flow",
        "turn_id": "4",
        "intent": "restaurant_booking",
        "slots": slots,
        "context": {
            "tool_result": {"data": {"id": "hold-1"}},
            "tool_name": "restaurant.create_hold",
            "slots": slots,
        },
    })
    assert reservation_request["tool_request"]["tool_name"] == "restaurant.create_reservation"
    assert reservation_request["tool_request"]["arguments"]["hold_id"] == "hold-1"
