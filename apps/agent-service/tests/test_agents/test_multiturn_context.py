import json

import pytest
from src.agents.graph import build_graph


class FlowGateway:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def registry(self, correlation_id: str) -> list[dict]:
        return [
            {"name": name, "permission": "draft_write" if name in {"create_cart", "add_to_cart"} else "read"}
            for name in (
                "search_food",
                "view_menu",
                "view_menu_item",
                "create_cart",
                "add_to_cart",
                "track_food_order",
                "prepare_food_order_cancellation_confirmation",
            )
        ]

    async def execute(self, name: str, arguments: dict, user_id: str, correlation_id: str) -> dict:
        self.calls.append(name)
        if name == "search_food":
            return {
                "items": [
                    {
                        "restaurant": {"id": "res_pho_hanoi", "name": "Phở Gánh Phố Cổ"},
                        "item": {"id": "item_pho_bo", "name": "Phở bò", "restaurant_id": "res_pho_hanoi"},
                    }
                ]
            }
        if name == "view_menu_item":
            return {
                "id": "item_Z_71b",
                "option_groups": [
                    {
                        "id": "group_random",
                        "name": "Kích thước",
                        "required": True,
                        "options": [{"id": "option_random", "name": "Cỡ lớn"}],
                    }
                ],
            }
        if name == "create_cart":
            return {"id": "cart_test"}
        if name == "add_to_cart":
            return {"id": arguments["cart_id"], "items": [{"menu_item_id": arguments["menu_item_id"]}]}
        return {"order_id": "ord_last", "status": "RESTAURANT_CONFIRMING"}


class RecordingLLM:
    def __init__(self, fenced: bool = False) -> None:
        self.prompt = ""
        self.fenced = fenced

    async def ainvoke(self, prompt: str) -> str:
        self.prompt = prompt
        value = json.dumps(
            {
                "intent": "search_food",
                "confidence": 0.9,
                "extracted_slots": {},
                "missing_slots": [],
                "references": {},
                "tool_calls": [{"name": "search_food", "arguments": {"keyword": "phở bò"}}],
                "response_message": None,
            }
        )
        return f"```json\n{value}\n```" if self.fenced else value


@pytest.mark.asyncio
async def test_structured_prompt_contains_messages_context_and_schema() -> None:
    gateway = FlowGateway()
    llm = RecordingLLM(fenced=True)
    graph = build_graph(tool_client=gateway, llm=llm)
    result = await graph.ainvoke(
        {
            "query": "Tìm phở bò",
            "user_id": "usr_demo_001",
            "conversation_id": "conv_1",
            "correlation_id": "cor_1",
            "messages": [{"role": "user", "content": "Xin chào"}],
            "workflow_context": {},
        }
    )
    assert "recent_messages" in llm.prompt
    assert "response_schema" in llm.prompt
    assert gateway.calls == []
    assert result["tool_calls"][0]["capability_name"] == "search_food"


@pytest.mark.asyncio
async def test_first_restaurant_alias_loads_authoritative_menu_from_persisted_candidates() -> None:
    gateway = FlowGateway()
    graph = build_graph(tool_client=gateway)
    result = await graph.ainvoke(
        {
            "query": "Chọn quán đầu tiên",
            "user_id": "usr_demo_001",
            "conversation_id": "conv_1",
            "correlation_id": "cor_2",
            "workflow_context": {"restaurant_candidates": [{"id": "res_pho_hanoi", "name": "Phở Gánh Phố Cổ"}]},
        }
    )
    assert [proposal["capability_name"] for proposal in result["tool_calls"]] == ["view_menu"]
    assert result["state_updates"]["restaurant_id"] == "res_pho_hanoi"


@pytest.mark.asyncio
async def test_add_item_creates_cart_and_adds_item_in_same_turn() -> None:
    gateway = FlowGateway()
    graph = build_graph(tool_client=gateway)
    result = await graph.ainvoke(
        {
            "query": "Cho tôi hai bát burger bò cỡ lớn",
            "user_id": "actor_random",
            "conversation_id": "conv_1",
            "correlation_id": "cor_3",
            "workflow_context": {
                "restaurant_id": "restaurant_A_93f",
                "menu_item_candidates": [
                    {"id": "item_Z_71b", "name": "burger bò", "restaurant_id": "restaurant_A_93f"}
                ],
            },
        }
    )
    assert gateway.calls == []
    assert [call["capability_name"] for call in result["tool_calls"]] == [
        "view_menu_item",
        "create_cart",
        "add_to_cart",
    ]


@pytest.mark.asyncio
async def test_typed_selected_food_action_cannot_fall_back_to_food_discovery() -> None:
    result = await build_graph().ainvoke(
        {
            "query": "internal selection status",
            "user_id": "actor-selected-item",
            "conversation_id": "conv-selected-item",
            "correlation_id": "cor-selected-item",
            "workflow_context": {
                "assistant_action": "ADD_SELECTED_FOOD_ITEM",
                "assistant_action_quantity": 3,
                "restaurant_id": "restaurant_A_93f",
                "menu_item_id": "item_Z_71b",
                "menu_item_candidates": [
                    {"id": "item_Z_71b", "name": "burger bò", "restaurant_id": "restaurant_A_93f"}
                ],
            },
        }
    )

    assert result["intent"] == "add_to_cart"
    assert [call["capability_name"] for call in result["tool_calls"]] == [
        "view_menu_item",
        "create_cart",
        "add_to_cart",
    ]
    assert result["tool_calls"][-1]["semantic_arguments"] == {
        "quantity": 3,
        "option_preferences": [],
    }


@pytest.mark.asyncio
async def test_validated_food_search_capability_overrides_conflicting_domain_classification() -> None:
    result = await build_graph().ainvoke(
        {
            "query": "tôi đói tôi muốn đặt đồ ăn",
            "user_id": "actor-planned-food-search",
            "conversation_id": "conv-planned-food-search",
            "correlation_id": "cor-planned-food-search",
            "workflow_context": {"planned_capability": "search_food"},
        }
    )

    assert result["intent"] == "search_food"
    assert [proposal["capability_name"] for proposal in result["tool_calls"]] == ["search_food"]
