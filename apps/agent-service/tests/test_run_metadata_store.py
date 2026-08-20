import asyncio
from pathlib import Path

import pytest
from pydantic import ValidationError
from src.application.run_metadata_store import (
    InMemoryAgentRunMetadataStore,
    RunMetadata,
    RunMetadataConflictError,
)
from src.infrastructure.database import persistence_ready


@pytest.mark.asyncio
async def test_memory_metadata_store_replays_same_allowlisted_record() -> None:
    store = InMemoryAgentRunMetadataStore()
    metadata = RunMetadata(
        actor_id="actor-1",
        workflow_id="workflow-1",
        run_id="run-1",
        phase="PLANNED",
        capability_names=["food.search"],
        latency_ms=12,
    )

    first = await store.record(metadata)
    replay = await store.record(metadata)

    assert replay == first
    assert await store.get("actor-1", "workflow-1", "run-1") == first
    assert await store.get("actor-2", "workflow-1", "run-1") is None


@pytest.mark.asyncio
async def test_memory_metadata_store_rejects_changed_replay() -> None:
    store = InMemoryAgentRunMetadataStore()
    original = RunMetadata(
        actor_id="actor-1",
        workflow_id="workflow-1",
        run_id="run-1",
        phase="PLANNED",
    )
    await store.record(original)

    with pytest.raises(RunMetadataConflictError):
        await store.record(original.model_copy(update={"phase": "COMPOSED"}))


@pytest.mark.asyncio
async def test_memory_metadata_store_has_one_concurrent_logical_write() -> None:
    store = InMemoryAgentRunMetadataStore()
    metadata = RunMetadata(
        actor_id="actor-concurrent",
        workflow_id="workflow-concurrent",
        run_id="run-concurrent",
        phase="PLANNED",
    )

    results = await asyncio.gather(*(store.record(metadata) for _ in range(25)))

    assert len({result.payload_hash() for result in results}) == 1
    assert await store.get(
        "actor-concurrent", "workflow-concurrent", "run-concurrent"
    ) == results[0]


def test_metadata_contract_rejects_conversation_or_domain_state() -> None:
    with pytest.raises(ValidationError):
        RunMetadata.model_validate(
            {
                "actor_id": "actor-1",
                "workflow_id": "workflow-1",
                "run_id": "run-1",
                "phase": "PLANNED",
                "message": "raw user text",
                "order_id": "order-authoritative",
            }
        )


def test_agent_source_contains_no_runtime_ddl() -> None:
    source_root = Path(__file__).resolve().parents[1] / "src"
    source = "\n".join(
        path.read_text(encoding="utf-8") for path in source_root.rglob("*.py")
    )
    assert "CREATE TABLE" not in source.upper()
    assert "CREATE INDEX" not in source.upper()


@pytest.mark.asyncio
async def test_memory_persistence_mode_is_ready() -> None:
    assert await persistence_ready() is True
