from pathlib import Path

import pytest
from src.agents.graph import build_graph


@pytest.mark.asyncio
async def test_food_graph_emits_versioned_non_executable_proposal() -> None:
    result = await build_graph().ainvoke(
        {
            "query": "Tim pho bo o Ba Dinh",
            "user_id": "usr_one",
            "conversation_id": "conv_one",
            "correlation_id": "cor_one",
            "workflow_context": {},
        }
    )

    proposal = result["tool_calls"][0]
    assert proposal == {
        "schema_version": "1",
        "capability_name": "search_food",
        "semantic_arguments": {
            "keyword": "pho bo",
            "district": "ba dinh",
        },
        "workflow_id": "conv_one",
        "tool_call_id": proposal["tool_call_id"],
        "risk_ceiling": "READ",
        "confirmation_gate": "none",
    }
    assert proposal["tool_call_id"].startswith("call_")
    assert result["tool_results"] == []


@pytest.mark.asyncio
async def test_food_proposal_does_not_echo_authoritative_ids() -> None:
    result = await build_graph().ainvoke(
        {
            "query": "Them 1 mon da chon vao gio",
            "user_id": "usr_one",
            "conversation_id": "conv_one",
            "correlation_id": "cor_two",
            "workflow_context": {
                "restaurant_id": "restaurant_secret",
                "menu_item_id": "item_secret",
                "cart_id": "cart_secret",
            },
        }
    )

    serialized = str(result["tool_calls"])
    assert "restaurant_secret" not in serialized
    assert "item_secret" not in serialized
    assert "cart_secret" not in serialized


def test_agent_source_has_no_gateway_execution_client() -> None:
    source_root = Path(__file__).resolve().parents[2] / "src"
    source = "\n".join(
        path.read_text(encoding="utf-8")
        for path in source_root.rglob("*.py")
    )

    assert "/internal/tools/execute" not in source
    assert "GatewayToolClient" not in source
    assert "gateway.execute" not in source
