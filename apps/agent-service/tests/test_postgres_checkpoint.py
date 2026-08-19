import pytest
from src.application.workflow_store import WorkflowStore
from src.infrastructure.database import get_sync_pool, init_db_schema


def test_workflow_store_memory_fallback():
    store = WorkflowStore()
    actor_id = "test_actor_1"
    wf_id = "wf_123"

    # Initially empty
    assert store.get(actor_id, wf_id) == {}

    # Save state
    store.save(actor_id, wf_id, {"intent": "search_food", "slots": {"dish": "pho"}})

    # Retrieve state
    state = store.get(actor_id, wf_id)
    assert state.get("intent") == "search_food"
    assert state.get("slots", {}).get("dish") == "pho"

    # Clear state
    store.clear(actor_id, wf_id)
    assert store.get(actor_id, wf_id) == {}


def test_database_infrastructure_safe_fallback():
    # Calling init_db_schema when DB is offline or invalid conninfo does not crash
    result = init_db_schema()
    assert isinstance(result, bool)
