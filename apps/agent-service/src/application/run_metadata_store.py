from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import UTC, datetime
from typing import Protocol

import psycopg
from psycopg_pool import PoolTimeout
from pydantic import BaseModel, ConfigDict, Field
from src.config import get_settings
from src.infrastructure.database import AgentPersistenceUnavailableError, get_async_pool, reset_pool

logger = logging.getLogger(__name__)


class RunMetadata(BaseModel):
    """Allowlisted Agent-owned run metadata; no conversation/domain state."""

    model_config = ConfigDict(extra="forbid")

    actor_id: str = Field(min_length=1, max_length=128)
    workflow_id: str = Field(min_length=1, max_length=128)
    run_id: str = Field(min_length=1, max_length=128)
    phase: str = Field(min_length=1, max_length=80)
    schema_version: str = Field(default="1", min_length=1, max_length=40)
    capability_names: list[str] = Field(default_factory=list, max_length=16)
    latency_ms: int = Field(default=0, ge=0)
    retry_count: int = Field(default=0, ge=0, le=10)
    error_code: str | None = Field(default=None, max_length=100)
    version: int = Field(default=1, ge=1)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    def payload_hash(self) -> str:
        safe = self.model_dump(mode="json", exclude={"version", "created_at"})
        encoded = json.dumps(safe, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


class RunMetadataConflictError(RuntimeError):
    """A run ID was reused with different allowlisted metadata."""


class AgentRunMetadataStore(Protocol):
    async def record(self, metadata: RunMetadata) -> RunMetadata: ...

    async def get(self, actor_id: str, workflow_id: str, run_id: str) -> RunMetadata | None: ...


class InMemoryAgentRunMetadataStore:
    """Deterministic test adapter with production-equivalent replay semantics."""

    def __init__(self) -> None:
        self._items: dict[tuple[str, str, str], tuple[str, RunMetadata]] = {}
        self._lock = asyncio.Lock()

    async def record(self, metadata: RunMetadata) -> RunMetadata:
        key = (metadata.actor_id, metadata.workflow_id, metadata.run_id)
        payload_hash = metadata.payload_hash()
        async with self._lock:
            existing = self._items.get(key)
            if existing is not None:
                if existing[0] != payload_hash:
                    raise RunMetadataConflictError("Run metadata ID was reused with different fields.")
                return existing[1].model_copy(deep=True)
            saved = metadata.model_copy(deep=True)
            self._items[key] = (payload_hash, saved)
            return saved.model_copy(deep=True)

    async def get(self, actor_id: str, workflow_id: str, run_id: str) -> RunMetadata | None:
        async with self._lock:
            item = self._items.get((actor_id, workflow_id, run_id))
            return item[1].model_copy(deep=True) if item is not None else None


class PostgresAgentRunMetadataStore:
    """PostgreSQL adapter for the explicitly migrated Agent metadata table."""

    async def record(self, metadata: RunMetadata) -> RunMetadata:
        for attempt in range(2):
            try:
                return await self._record_once(metadata)
            except (PoolTimeout, psycopg.OperationalError, psycopg.InterfaceError) as exc:
                await reset_pool()
                if attempt == 1:
                    raise AgentPersistenceUnavailableError(
                        "Agent metadata database connection failed."
                    ) from exc
                logger.warning(
                    "Agent metadata write recovered after connection reset: %s",
                    type(exc).__name__,
                )
        raise AgentPersistenceUnavailableError("Agent metadata database connection failed.")

    async def _record_once(self, metadata: RunMetadata) -> RunMetadata:
        pool = await get_async_pool()
        if pool is None:
            raise AgentPersistenceUnavailableError("PostgreSQL persistence is required.")
        payload_hash = metadata.payload_hash()
        async with pool.connection(timeout=1.0) as connection:
            async with connection.transaction():
                cursor = await connection.execute(
                    """
                    INSERT INTO agent_run_metadata (
                        actor_id, workflow_id, run_id, phase, schema_version,
                        capability_names, latency_ms, retry_count, error_code,
                        payload_hash, version, created_at
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1, %s
                    )
                    ON CONFLICT (actor_id, workflow_id, run_id) DO NOTHING
                    RETURNING version, created_at
                    """,
                    (
                        metadata.actor_id,
                        metadata.workflow_id,
                        metadata.run_id,
                        metadata.phase,
                        metadata.schema_version,
                        metadata.capability_names,
                        metadata.latency_ms,
                        metadata.retry_count,
                        metadata.error_code,
                        payload_hash,
                        metadata.created_at,
                    ),
                )
                inserted = await cursor.fetchone()
                if inserted is not None:
                    return metadata.model_copy(
                        update={"version": int(inserted[0]), "created_at": inserted[1]}
                    )
                existing = await self._get_with_hash(
                    connection, metadata.actor_id, metadata.workflow_id, metadata.run_id
                )
                if existing is None or existing[0] != payload_hash:
                    raise RunMetadataConflictError(
                        "Run metadata ID was reused with different fields."
                    )
                return existing[1]

    async def get(
        self, actor_id: str, workflow_id: str, run_id: str
    ) -> RunMetadata | None:
        pool = await get_async_pool()
        if pool is None:
            raise AgentPersistenceUnavailableError("PostgreSQL persistence is required.")
        async with pool.connection(timeout=1.0) as connection:
            existing = await self._get_with_hash(
                connection, actor_id, workflow_id, run_id
            )
            return existing[1] if existing is not None else None

    async def _get_with_hash(
        self, connection, actor_id: str, workflow_id: str, run_id: str
    ) -> tuple[str, RunMetadata] | None:
        cursor = await connection.execute(
            """
            SELECT payload_hash, phase, schema_version, capability_names,
                   latency_ms, retry_count, error_code, version, created_at
            FROM agent_run_metadata
            WHERE actor_id = %s AND workflow_id = %s AND run_id = %s
            """,
            (actor_id, workflow_id, run_id),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return (
            str(row[0]),
            RunMetadata(
                actor_id=actor_id,
                workflow_id=workflow_id,
                run_id=run_id,
                phase=str(row[1]),
                schema_version=str(row[2]),
                capability_names=list(row[3] or []),
                latency_ms=int(row[4]),
                retry_count=int(row[5]),
                error_code=str(row[6]) if row[6] is not None else None,
                version=int(row[7]),
                created_at=row[8],
            ),
        )


_MEMORY_STORE = InMemoryAgentRunMetadataStore()
_POSTGRES_STORE = PostgresAgentRunMetadataStore()


def get_run_metadata_store() -> AgentRunMetadataStore:
    if get_settings().agent_persistence_mode == "memory":
        return _MEMORY_STORE
    return _POSTGRES_STORE
