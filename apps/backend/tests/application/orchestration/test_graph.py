import pytest
from src.application.orchestration.graph import concierge_graph


@pytest.mark.asyncio
async def test_concierge_basic_flow():
    result = await concierge_graph.ainvoke({"query": "Hello"})
    assert "response" in result


@pytest.mark.asyncio
async def test_concierge_state_structure():
    result = await concierge_graph.ainvoke({"query": "Test query"})
    assert isinstance(result, dict)
    assert "query" in result


