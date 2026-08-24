import json

import pytest
from src.agents.graph import build_graph


class FakeGateway:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    async def registry(self, correlation_id: str) -> list[dict]:
        self.calls.append(("registry", correlation_id))
        return [{"name": "search_food", "permission": "read"}]

    async def execute(self, name: str, arguments: dict, user_id: str, correlation_id: str) -> dict:
        self.calls.append((name, correlation_id))
        return {
            "items": [
                {
                    "restaurant": {"id": "restaurant_A_93f", "name": "Burger House"},
                    "item": {"id": "item_Z_71b", "name": "burger bò", "restaurant_id": "restaurant_A_93f"},
                }
            ]
        }


class FakeLLM:
    async def ainvoke(self, prompt: str) -> str:
        return json.dumps(
            {
                "intent": "search_food",
                "confidence": 0.99,
                "extracted_slots": {},
                "missing_slots": [],
                "tool_calls": [{"name": "search_food", "arguments": {"keyword": "phở bò"}}],
            }
        )


@pytest.mark.asyncio
async def test_agent_uses_correlation_id_for_stable_proposal() -> None:
    gateway = FakeGateway()
    graph = build_graph(tool_client=gateway, llm=FakeLLM())
    result = await graph.ainvoke(
        {
            "query": "Tìm phở bò",
            "user_id": "usr_demo_001",
            "conversation_id": "conv_1",
            "correlation_id": "cor_test_1",
            "workflow_context": {},
        }
    )
    assert gateway.calls == []
    assert result["tool_calls"][0]["capability_name"] == "search_food"
    assert result["tool_calls"][0]["tool_call_id"].startswith("call_")
