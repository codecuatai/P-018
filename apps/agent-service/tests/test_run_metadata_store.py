import asyncio
from pathlib import Path

import psycopg
import pytest
import src.application.run_metadata_store as metadata_module
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


class _FakeTransaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        return False


class _FakeCursor:
    async def fetchone(self):
        return (1, RunMetadata.model_construct().created_at)


class _FakeConnection:
    def __init__(self, *, fail: bool) -> None:
        self.fail = fail

    def transaction(self):
        return _FakeTransaction()

    async def execute(self, _query, _params):
        if self.fail:
            raise psycopg.errors.AdminShutdown("connection closed by test")
        return _FakeCursor()


class _FakeConnectionContext:
    def __init__(self, connection: _FakeConnection) -> None:
        self.connection = connection

    async def __aenter__(self):
        return self.connection

    async def __aexit__(self, exc_type, exc_value, traceback):
        return False


class _FakePool:
    def __init__(self, *, fail: bool) -> None:
        self.connection_value = _FakeConnection(fail=fail)

    def connection(self, **_kwargs):
        return _FakeConnectionContext(self.connection_value)


@pytest.mark.asyncio
async def test_postgres_metadata_reconnects_after_connection_shutdown(monkeypatch) -> None:
    pools = [_FakePool(fail=True), _FakePool(fail=False)]
    resets = 0

    async def fake_get_pool():
        return pools.pop(0)

    async def fake_reset_pool():
        nonlocal resets
        resets += 1

    monkeypatch.setattr(metadata_module, "get_async_pool", fake_get_pool)
    monkeypatch.setattr(metadata_module, "reset_pool", fake_reset_pool)

    metadata = RunMetadata(
        actor_id="actor-reconnect",
        workflow_id="workflow-reconnect",
        run_id="run-reconnect",
        phase="PLANNED",
    )
    result = await metadata_module.PostgresAgentRunMetadataStore().record(metadata)

    assert result.version == 1
    assert resets == 1
