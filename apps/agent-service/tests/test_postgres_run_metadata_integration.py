"""Opt-in checks for the real Agent-owned PostgreSQL metadata boundary.

Run only with ``AGENT_TEST_DATABASE_URL`` pointing at an empty disposable test
database. The suite never falls back to a developer database or memory.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from uuid import uuid4

import pytest
import src.application.run_metadata_store as metadata_module
from psycopg_pool import AsyncConnectionPool
from src.application.run_metadata_store import (
    PostgresAgentRunMetadataStore,
    RunMetadata,
    RunMetadataConflictError,
)

DATABASE_URL = os.environ.get("AGENT_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="AGENT_TEST_DATABASE_URL is not configured"
)


async def _open_pool() -> AsyncConnectionPool:
    assert DATABASE_URL
    pool = AsyncConnectionPool(
        conninfo=DATABASE_URL, min_size=1, max_size=10, open=False
    )
    await pool.open(wait=True, timeout=5.0)
    return pool


@pytest.mark.asyncio
async def test_postgres_metadata_replay_concurrency_restart_and_privacy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pool = await _open_pool()
    migration = (
        Path(__file__).resolve().parents[1]
        / "migrations"
        / "002_agent_run_metadata.sql"
    ).read_text(encoding="utf-8")
    async with pool.connection() as connection:
        await connection.execute(migration, prepare=False)

    async def active_pool() -> AsyncConnectionPool:
        return pool

    monkeypatch.setattr(metadata_module, "get_async_pool", active_pool)
    store = PostgresAgentRunMetadataStore()
    suffix = uuid4().hex
    metadata = RunMetadata(
        actor_id=f"actor-{suffix}",
        workflow_id=f"workflow-{suffix}",
        run_id=f"run-{suffix}",
        phase="PLANNED",
        capability_names=["search_food"],
        latency_ms=9,
    )
    try:
        results = await asyncio.gather(*(store.record(metadata) for _ in range(20)))
        assert len({result.payload_hash() for result in results}) == 1

        with pytest.raises(RunMetadataConflictError):
            await store.record(metadata.model_copy(update={"phase": "COMPOSED"}))

        async with pool.connection() as connection:
            cursor = await connection.execute(
                """
                SELECT actor_id, workflow_id, run_id, phase, schema_version,
                       capability_names, latency_ms, retry_count, error_code,
                       payload_hash, version, created_at
                FROM agent_run_metadata
                WHERE actor_id = %s AND workflow_id = %s AND run_id = %s
                """,
                (metadata.actor_id, metadata.workflow_id, metadata.run_id),
            )
            row = await cursor.fetchone()
            assert row is not None
            assert len(row) == 12

        await pool.close()
        pool = await _open_pool()
        restored = await PostgresAgentRunMetadataStore().get(
            metadata.actor_id, metadata.workflow_id, metadata.run_id
        )
        assert restored is not None
        assert restored.payload_hash() == metadata.payload_hash()
    finally:
        if pool.closed:
            pool = await _open_pool()
        async with pool.connection() as connection:
            await connection.execute(
                """
                DELETE FROM agent_run_metadata
                WHERE actor_id = %s AND workflow_id = %s AND run_id = %s
                """,
                (metadata.actor_id, metadata.workflow_id, metadata.run_id),
            )
        await pool.close()
