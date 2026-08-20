from __future__ import annotations

import logging

from psycopg_pool import AsyncConnectionPool, ConnectionPool

from src.config import get_settings

logger = logging.getLogger(__name__)

_SYNC_POOL: ConnectionPool | None = None
_ASYNC_POOL: AsyncConnectionPool | None = None
_DB_AVAILABLE: bool | None = None


def is_db_available() -> bool:
    global _DB_AVAILABLE
    if _DB_AVAILABLE is not None:
        return _DB_AVAILABLE
    settings = get_settings()
    if not settings.database_url or settings.app_env == "test":
        _DB_AVAILABLE = False
        return False
    return True


def get_sync_pool() -> ConnectionPool | None:
    global _SYNC_POOL, _DB_AVAILABLE
    if not is_db_available():
        return None
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
                kwargs={"connect_timeout": 1},
            )
            _SYNC_POOL.open(wait=False)
        except Exception as exc:
            logger.debug("Could not initialize PostgreSQL sync connection pool: %s", exc)
            _SYNC_POOL = None
            _DB_AVAILABLE = False
    return _SYNC_POOL


async def get_async_pool() -> AsyncConnectionPool | None:
    global _ASYNC_POOL, _DB_AVAILABLE
    if not is_db_available():
        return None
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
                kwargs={"connect_timeout": 1},
            )
            await _ASYNC_POOL.open(wait=False)
        except Exception as exc:
            logger.debug("Could not initialize PostgreSQL async connection pool: %s", exc)
            _ASYNC_POOL = None
            _DB_AVAILABLE = False
    return _ASYNC_POOL


def init_db_schema() -> bool:
    """Verify that the owned Agent migration has been applied."""
    global _DB_AVAILABLE
    settings = get_settings()
    if not settings.database_url or settings.app_env == "test":
        _DB_AVAILABLE = False
        return False
    try:
        pool = get_sync_pool()
        if pool is None:
            _DB_AVAILABLE = False
            return False
        with pool.connection(timeout=1.0) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT to_regclass('public.agent_workflow_states')")
                row = cur.fetchone()
                if not row or row[0] is None:
                    logger.error("Agent database migration is missing: agent_workflow_states was not found.")
                    _DB_AVAILABLE = False
                    return False
        logger.info("Agent workflow persistence schema is available.")
        _DB_AVAILABLE = True
        return True
    except Exception as exc:
        logger.debug("Database schema initialization deferred: %s", exc)
        _DB_AVAILABLE = False
        return False


def close_pools() -> None:
    global _SYNC_POOL, _ASYNC_POOL, _DB_AVAILABLE
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
    _DB_AVAILABLE = None
