from __future__ import annotations

import logging

from psycopg_pool import AsyncConnectionPool

from src.config import get_settings

logger = logging.getLogger(__name__)

_ASYNC_POOL: AsyncConnectionPool | None = None


class AgentPersistenceUnavailableError(RuntimeError):
    """Raised when required Agent metadata persistence cannot be reached."""


async def get_async_pool() -> AsyncConnectionPool | None:
    """Return the Agent-owned pool without creating or altering any schema."""

    global _ASYNC_POOL
    settings = get_settings()
    if settings.agent_persistence_mode == "memory":
        return None
    if _ASYNC_POOL is not None:
        return _ASYNC_POOL

    pool = AsyncConnectionPool(
        conninfo=settings.database_url,
        min_size=1,
        max_size=10,
        open=False,
        kwargs={"connect_timeout": 2},
    )
    try:
        await pool.open(wait=True, timeout=3.0)
    except Exception as exc:
        await pool.close()
        logger.warning("Required Agent metadata database is unavailable: %s", type(exc).__name__)
        raise AgentPersistenceUnavailableError("Agent metadata database is unavailable.") from exc
    _ASYNC_POOL = pool
    return pool


async def persistence_ready() -> bool:
    """Probe connectivity and the explicitly migrated metadata table."""

    settings = get_settings()
    if settings.agent_persistence_mode == "memory":
        return True
    try:
        pool = await get_async_pool()
        if pool is None:
            return False
        async with pool.connection(timeout=1.0) as connection:
            cursor = await connection.execute(
                "SELECT to_regclass('public.agent_run_metadata')"
            )
            row = await cursor.fetchone()
            return bool(row and row[0])
    except Exception as exc:
        logger.warning("Agent metadata readiness probe failed: %s", type(exc).__name__)
        await reset_pool()
        return False


async def reset_pool() -> None:
    """Close the pool so a later request can recover after an outage."""

    global _ASYNC_POOL
    pool = _ASYNC_POOL
    _ASYNC_POOL = None
    if pool is not None:
        try:
            await pool.close()
        except Exception as exc:
            logger.warning("Agent metadata pool close failed: %s", type(exc).__name__)


async def close_pool() -> None:
    await reset_pool()
