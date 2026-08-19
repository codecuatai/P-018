import pytest
from src.agents.healthcare_graph import classify_and_extract


@pytest.mark.asyncio
async def test_slot_selection_does_not_hold_without_explicit_confirmation() -> None:
    result = await classify_and_extract(
        {
            "query": "slot 42",
            "workflow_id": "wf-healthcare-safety",
            "turn_id": "2",
            "intent": "healthcare_booking",
            "context": {
                "slots": {"department": "Khoa Nội Thần kinh", "patient_id": 1},
                "tool_name": "healthcare.list_slots",
                "tool_result": [
                    {"id": 7, "name": "Bác sĩ A", "available_slots": [{"id": 42, "start_time": "2099-01-01T08:00:00"}]}
                ],
            },
        }
    )

    assert result["status"] == "NEEDS_INPUT"
    assert result["missing_slots"] == ["confirmation"]
    assert "tool_request" not in result


@pytest.mark.asyncio
async def test_explicit_confirmation_uses_the_authoritative_held_appointment() -> None:
    result = await classify_and_extract(
        {
            "query": "xác nhận lịch khám",
            "workflow_id": "wf-healthcare-safety",
            "turn_id": "4",
            "intent": "healthcare_booking",
            "context": {
                "slots": {"department": "Khoa Nội Thần kinh", "patient_id": 1, "slot_id": 42},
                "tool_name": "healthcare.hold_slot",
                "tool_result": {"appointment_id": 99, "slot_id": 42, "is_paid": False},
            },
        }
    )

    assert result["tool_request"]["tool_name"] == "healthcare.confirm_appointment"
    assert result["tool_request"]["arguments"] == {"appointment_id": 99}


@pytest.mark.asyncio
async def test_first_confirmation_holds_selected_slot_before_final_confirmation() -> None:
    result = await classify_and_extract(
        {
            "query": "xac nhan lich kham",
            "workflow_id": "wf-healthcare-safety",
            "turn_id": "3",
            "intent": "healthcare_booking",
            "context": {
                "slots": {"department": "Than kinh", "patient_id": 1, "slot_id": 42},
                "tool_name": "healthcare.list_slots",
                "tool_result": [{"id": 7, "name": "Bac si A", "available_slots": [{"id": 42}]}],
            },
        }
    )

    assert result["status"] == "TOOL_REQUEST_READY"
    assert result["tool_request"]["tool_name"] == "healthcare.hold_slot"


@pytest.mark.asyncio
async def test_cancellation_is_recognized_without_a_previous_healthcare_turn() -> None:
    result = await classify_and_extract(
        {
            "query": "huy lich appointment 3",
            "workflow_id": "wf-healthcare-cancel",
            "turn_id": "1",
            "context": {},
        }
    )

    assert result["tool_request"]["tool_name"] == "healthcare.cancel_appointment"
    assert result["tool_request"]["arguments"] == {"appointment_id": 3}
