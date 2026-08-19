from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from psycopg_pool import AsyncConnectionPool, ConnectionPool

from src.config import get_settings

logger = logging.getLogger(__name__)

_SYNC_POOL: ConnectionPool | None = None
_ASYNC_POOL: AsyncConnectionPool | None = None


def get_sync_pool() -> ConnectionPool | None:
    global _SYNC_POOL
    settings = get_settings()
    if not settings.database_url:
        return None
    if _SYNC_POOL is None:
        try:
            _SYNC_POOL = ConnectionPool(
                conninfo=settings.database_url,
                min_size=1,
                max_size=10,
                open=False,
            )
            _SYNC_POOL.open(wait=False)
        except Exception as exc:
            logger.warning("Could not initialize PostgreSQL sync connection pool: %s", exc)
            _SYNC_POOL = None
    return _SYNC_POOL


async def get_async_pool() -> AsyncConnectionPool | None:
    global _ASYNC_POOL
    settings = get_settings()
    if not settings.database_url:
        return None
    if _ASYNC_POOL is None:
        try:
            _ASYNC_POOL = AsyncConnectionPool(
                conninfo=settings.database_url,
                min_size=1,
                max_size=10,
                open=False,
            )
            await _ASYNC_POOL.open(wait=False)
        except Exception as exc:
            logger.warning("Could not initialize PostgreSQL async connection pool: %s", exc)
            _ASYNC_POOL = None
    return _ASYNC_POOL


def init_db_schema() -> bool:
    """Initialize database tables for agent workflow states and checkpoints."""
    settings = get_settings()
    if not settings.database_url:
        return False
    try:
        pool = get_sync_pool()
        if pool is None:
            return False
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS agent_workflow_states (
                        actor_id VARCHAR(128) NOT NULL,
                        workflow_id VARCHAR(128) NOT NULL,
                        state JSONB NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        PRIMARY KEY (actor_id, workflow_id)
                    );
                    CREATE INDEX IF NOT EXISTS idx_agent_wf_updated_at 
                    ON agent_workflow_states(updated_at);
                    """
                )
                conn.commit()
        logger.info("Successfully initialized agent_workflow_states table in xone_agent.")
        return True
    except Exception as exc:
        logger.warning("Database schema initialization deferred or skipped: %s", exc)
        return False


def close_pools() -> None:
    global _SYNC_POOL, _ASYNC_POOL
    if _SYNC_POOL is not None:
        try:
            _SYNC_POOL.close()
        except Exception:
            pass
        _SYNC_POOL = None
    if _ASYNC_POOL is not None:
        try:
            _ASYNC_POOL.close()
        except Exception:
            pass
        _ASYNC_POOL = None
