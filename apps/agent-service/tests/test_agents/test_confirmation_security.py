from __future__ import annotations

import pytest
from pydantic import ValidationError
from src.agents.confirmation import is_explicit_confirmation
from src.agents.nodes.restaurant_node import RestaurantExtraction, classify_and_extract


@pytest.mark.parametrize(
    "message",
    ["xác nhận", "xac nhan", "ĐỒNG Ý", "ok", "mình xác nhận nhé", "giữ bàn"],
)
def test_explicit_confirmation_accepts_bounded_phrases(message: str) -> None:
    assert is_explicit_confirmation(message)


@pytest.mark.parametrize(
    "message",
    [
        "không xác nhận",
        "chưa đồng ý",
        "xác nhận được không?",
        "có",
        "được không",
        "đổi giờ rồi xác nhận",
        "khoan, xác nhận",
        "tôi chưa chắc",
    ],
)
def test_explicit_confirmation_rejects_negation_questions_and_ambiguity(message: str) -> None:
    assert not is_explicit_confirmation(message)


@pytest.mark.parametrize(
    "forbidden",
    [
        {"restaurant_id": "injected"},
        {"price": 1},
        {"availability": True},
        {"resource_version": "v1"},
        {"confirmation_id": "injected"},
    ],
)
def test_restaurant_model_patch_forbids_authoritative_fields(forbidden: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        RestaurantExtraction.model_validate(
            {"intent": "restaurant", "slot_patch": forbidden, "confidence": 1}
        )


@pytest.mark.asyncio
async def test_ambiguous_restaurant_reply_cannot_create_hold() -> None:
    result = await classify_and_extract(
        {
            "query": "có",
            "workflow_id": "wf-confirmation",
            "turn_id": "2",
            "intent": "restaurant_booking",
            "context": {
                "tool_name": "restaurant.check_availability",
                "tool_result": {"available": True},
                "slots": {
                    "restaurant_id": "trusted",
                    "party_size": 2,
                    "start_at": "2099-01-01T19:00:00+07:00",
                },
            },
        }
    )
    assert result.get("tool_request") is None
