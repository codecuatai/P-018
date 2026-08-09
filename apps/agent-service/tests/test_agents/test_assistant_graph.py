import json
from typing import Any

import pytest
from src.agents.assistant_graph import (
    AssistantPlan,
    PlannedTask,
    _model_prompt,
    build_assistant_graph,
    deterministic_plan,
)


def domains(plan: AssistantPlan) -> list[str]:
    return [task.domain for task in plan.tasks]


def test_deterministic_fallback_supports_single_ride() -> None:
    plan = deterministic_plan("Đặt xe từ VinUni đến Hồ Gươm")
    assert domains(plan) == ["ride"]
    assert plan.tasks[0].extracted_slots["pickup_address"] == "VinUni"
    assert plan.tasks[0].extracted_slots["dropoff_address"] == "Hồ Gươm"


def test_deterministic_fallback_distinguishes_food_and_restaurant() -> None:
    assert domains(deterministic_plan("Đặt phở giao về nhà")) == ["food"]
    assert domains(deterministic_plan("Đặt bàn ăn phở cho 2 người")) == ["restaurant"]


def test_deterministic_fallback_plans_independent_tasks() -> None:
    plan = deterministic_plan("Tìm phở giao về nhà và đặt lịch khám thần kinh sáng mai")
    assert domains(plan) == ["food", "healthcare"]
    assert plan.tasks[0].extracted_slots["dish_query"] == "pho"
    assert plan.tasks[1].extracted_slots["department"] == "than kinh"


def test_deterministic_fallback_marks_restaurant_ride_dependency() -> None:
    plan = deterministic_plan("Đặt bàn tối nay rồi gọi xe từ VinUni tới nhà hàng đó")
    assert domains(plan) == ["restaurant", "ride"]
    assert plan.tasks[1].depends_on == [0]


def test_healthcare_then_ride_uses_dependency_without_guessing_destination() -> None:
    plan = deterministic_plan("Đặt lịch khám thần kinh sáng mai rồi đặt xe từ VinUni đưa tôi tới đó.")
    assert domains(plan) == ["healthcare", "ride"]
    assert plan.tasks[0].extracted_slots["department"] == "than kinh"
    assert plan.tasks[0].extracted_slots["time_preference"] == "tomorrow_morning"
    assert plan.tasks[1].depends_on == [0]
    assert plan.tasks[1].extracted_slots["pickup_address"] == "VinUni"
    assert "dropoff_address" not in plan.tasks[1].extracted_slots


def test_follow_up_updates_existing_task_instead_of_creating_random_task() -> None:
    first = deterministic_plan("Đặt bàn tối nay rồi gọi xe từ VinUni tới nhà hàng đó")
    state = {"tasks": [task.model_dump() for task in first.tasks]}
    follow_up = deterministic_plan("2 người", state)
    assert domains(follow_up) == ["restaurant"]
    assert follow_up.tasks[0].extracted_slots["party_size"] == 2


def test_food_follow_up_targets_food_only_when_other_tasks_are_active() -> None:
    state = {
        "tasks": [
            {
                "domain": "food",
                "phase": "IN_PROGRESS",
                "goal": "Tìm món giao tận nơi",
                "extracted_slots": {"query": "phở"},
                "pending_choice": {"kind": "food_restaurant_candidates", "count": 2},
            },
            {
                "domain": "healthcare",
                "phase": "NEEDS_INFO",
                "goal": "Tìm lịch khám",
                "extracted_slots": {"department": "than kinh"},
                "pending_actions": ["select_healthcare_slot"],
            },
        ]
    }
    follow_up = deterministic_plan("Chọn quán đầu tiên", state)
    assert domains(follow_up) == ["food"]


def test_ambiguous_generic_selection_requests_one_clarification() -> None:
    state = {
        "tasks": [
            {"domain": "restaurant", "phase": "NEEDS_INFO", "extracted_slots": {}, "pending_actions": ["select_restaurant"]},
            {"domain": "healthcare", "phase": "NEEDS_INFO", "extracted_slots": {}, "pending_actions": ["select_healthcare_slot"]},
        ]
    }
    plan = deterministic_plan("Chọn cái đầu tiên", state)
    assert plan.tasks == []
    assert plan.clarification_question


def test_follow_up_can_supply_a_plain_location() -> None:
    first = deterministic_plan("Đặt bàn tối nay cho 2 người")
    state = {"tasks": [task.model_dump() for task in first.tasks]}
    follow_up = deterministic_plan("Hoàn Kiếm", state)
    assert domains(follow_up) == ["restaurant"]
    assert follow_up.tasks[0].extracted_slots["location"] == "Hoàn Kiếm"


def test_unsupported_request_is_safe() -> None:
    plan = deterministic_plan("Đặt vé máy bay đi Đà Nẵng")
    assert plan.tasks == []
    assert "chưa hỗ trợ" in plan.assistant_message


class FakePlanner:
    async def ainvoke_structured(self, _prompt: str, schema: type[Any]) -> Any:
        assert schema is AssistantPlan
        return AssistantPlan(
            assistant_message="Mình sẽ giúp bạn.",
            tasks=[
                PlannedTask(
                    domain="restaurant",
                    goal="Tìm nhà hàng",
                    normalized_request="Tìm nhà hàng ở Hà Nội",
                    extracted_slots={"location": "Hà Nội", "restaurant_id": "model-must-not-survive"},
                ),
                PlannedTask(
                    domain="ride",
                    goal="Tìm xe tới nhà hàng",
                    normalized_request="Đặt xe từ VinUni tới nhà hàng đó",
                    extracted_slots={"pickup_address": "VinUni", "dropoff_address": "nhà hàng đó"},
                    depends_on=[0],
                ),
            ],
        )


@pytest.mark.asyncio
async def test_model_path_uses_structured_planner_and_removes_resource_ids() -> None:
    graph = build_assistant_graph(llm=FakePlanner())
    result = await graph.ainvoke({"query": "Tìm nhà hàng rồi gọi xe", "conversation_state": {}})
    assert result["decision_source"] == "model"
    assert [task["domain"] for task in result["plan"]["tasks"]] == ["restaurant", "ride"]
    assert "restaurant_id" not in result["plan"]["tasks"][0]["extracted_slots"]


def test_model_prompt_contains_only_planner_safe_state() -> None:
    prompt = _model_prompt(
        {
            "query": "Chọn quán đầu tiên",
            "messages": [{"role": "user", "content": "Tìm món"}],
            "conversation_state": {
                "tasks": [{
                    "id": "task-secret",
                    "domain": "food",
                    "goal": "Tìm món",
                    "phase": "IN_PROGRESS",
                    "extracted_slots": {"query": "phở", "restaurant_id": "restaurant-secret"},
                    "authoritative": {
                        "confirmation_id": "confirmation-secret",
                        "workflow_id": "workflow-secret",
                        "order_id": "order-secret",
                        "payment": {"provider_reference": "provider-secret"},
                    },
                }],
                "actions": [{"id": "action-secret", "kind": "food_confirm", "task_id": "task-secret"}],
            },
        }
    )
    parsed = json.loads(prompt)
    state = parsed["conversation_state"]
    serialized = json.dumps(state)
    for forbidden in ("task-secret", "confirmation-secret", "workflow-secret", "order-secret", "provider-secret", "action-secret", "authoritative"):
        assert forbidden not in serialized
    assert state["tasks"][0]["task_ref"] == 0
    assert state["tasks"][0]["extracted_slots"] == {"query": "phở"}
