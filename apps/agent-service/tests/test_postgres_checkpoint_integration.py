from __future__ import annotations

import os
from uuid import uuid4

import pytest

from src.application.workflow_store import WorkflowStore
from src.config import get_settings
from src.infrastructure import database


@pytest.mark.skipif(
    not os.getenv("AGENT_TEST_DATABASE_URL"),
    reason="AGENT_TEST_DATABASE_URL is required for PostgreSQL integration",
)
def test_workflow_store_round_trip_survives_repository_recreation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("DATABASE_URL", os.environ["AGENT_TEST_DATABASE_URL"])
    get_settings.cache_clear()
    database.close_pools()

    actor_id = f"actor-{uuid4().hex}"
    workflow_id = f"workflow-{uuid4().hex}"
    state = {"intent": "search_food", "slots": {"dish": "pho"}, "revision": 1}
    try:
        assert database.init_db_schema() is True
        WorkflowStore().save(actor_id, workflow_id, state)
        assert WorkflowStore().get(actor_id, workflow_id) == state
        WorkflowStore().clear(actor_id, workflow_id)
        assert WorkflowStore().get(actor_id, workflow_id) == {}
    finally:
        database.close_pools()
        get_settings.cache_clear()
