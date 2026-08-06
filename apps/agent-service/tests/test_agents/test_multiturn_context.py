import json

import pytest
from src.agents.graph import build_graph


class FlowGateway:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def registry(self, correlation_id: str) -> list[dict]:
        return [{"name": name, "permission": "draft_write" if name in {"create_cart", "add_to_cart"} else "read"} for name in ("search_food", "create_cart", "add_to_cart", "track_food_order", "prepare_food_order_cancellation_confirmation")]

    async def execute(self, name: str, arguments: dict, user_id: str, correlation_id: str) -> dict:
        self.calls.append(name)
        if name == "search_food":
            return {"items": [{"restaurant": {"id": "res_pho_hanoi", "name": "Phở Gánh Phố Cổ"}, "item": {"id": "item_pho_bo", "name": "Phở bò", "restaurant_id": "res_pho_hanoi"}}]}
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
        value = json.dumps({"intent": "search_food", "confidence": 0.9, "extracted_slots": {}, "missing_slots": [], "references": {}, "tool_calls": [{"name": "search_food", "arguments": {"keyword": "phở bò"}}], "response_message": None})
        return f"```json\n{value}\n```" if self.fenced else value


@pytest.mark.asyncio
async def test_structured_prompt_contains_messages_context_and_schema() -> None:
    gateway = FlowGateway()
    llm = RecordingLLM(fenced=True)
    graph = build_graph(tool_client=gateway, llm=llm)
    result = await graph.ainvoke({"query": "Tìm phở bò", "user_id": "usr_demo_001", "conversation_id": "conv_1", "correlation_id": "cor_1", "messages": [{"role": "user", "content": "Xin chào"}], "workflow_context": {}})
    assert "recent_messages" in llm.prompt
    assert "response_schema" in llm.prompt
    assert result["state_updates"]["restaurant_candidates"][0]["id"] == "res_pho_hanoi"


@pytest.mark.asyncio
async def test_first_restaurant_alias_resolves_from_persisted_candidates() -> None:
    gateway = FlowGateway()
    graph = build_graph(tool_client=gateway)
    result = await graph.ainvoke({"query": "Chọn quán đầu tiên", "user_id": "usr_demo_001", "conversation_id": "conv_1", "correlation_id": "cor_2", "workflow_context": {"restaurant_candidates": [{"id": "res_pho_hanoi", "name": "Phở Gánh Phố Cổ"}]}})
    assert result["state_updates"]["restaurant_id"] == "res_pho_hanoi"


@pytest.mark.asyncio
async def test_add_item_creates_cart_and_adds_item_in_same_turn() -> None:
    gateway = FlowGateway()
    graph = build_graph(tool_client=gateway)
    result = await graph.ainvoke({"query": "Cho tôi hai bát phở bò cỡ lớn không cay", "user_id": "usr_demo_001", "conversation_id": "conv_1", "correlation_id": "cor_3", "workflow_context": {"restaurant_id": "res_pho_hanoi"}})
    assert gateway.calls == ["create_cart", "add_to_cart"]
    assert result["state_updates"]["cart_id"] == "cart_test"
