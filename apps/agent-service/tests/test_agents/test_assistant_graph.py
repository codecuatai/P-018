from typing import Any

import pytest
from src.agents.assistant_graph import (
    AssistantPlan,
    PlannedTask,
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
    assert plan.tasks[1].extracted_slots["department"] == "than kinh"


def test_deterministic_fallback_marks_restaurant_ride_dependency() -> None:
    plan = deterministic_plan("Đặt bàn tối nay rồi gọi xe từ VinUni tới nhà hàng đó")
    assert domains(plan) == ["restaurant", "ride"]
    assert plan.tasks[1].depends_on == [0]


def test_follow_up_updates_existing_task_instead_of_creating_random_task() -> None:
    first = deterministic_plan("Đặt bàn tối nay rồi gọi xe từ VinUni tới nhà hàng đó")
    state = {"tasks": [task.model_dump() for task in first.tasks]}
    follow_up = deterministic_plan("2 người", state)
    assert domains(follow_up) == ["restaurant", "ride"]
    assert follow_up.tasks[0].extracted_slots["party_size"] == 2


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
