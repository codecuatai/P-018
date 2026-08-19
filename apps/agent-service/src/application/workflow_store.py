from __future__ import annotations

import json
import logging
from copy import deepcopy
from threading import RLock
from typing import Any

from src.infrastructure.database import get_sync_pool

logger = logging.getLogger(__name__)


class WorkflowStore:
    """Production workflow store with PostgreSQL persistence in xone_agent

    and transparent in-memory fallback for offline test execution.
    """

    def __init__(self) -> None:
        self._items: dict[tuple[str, str], dict[str, Any]] = {}
        self._lock = RLock()

    def get(self, actor_id: str, workflow_id: str) -> dict[str, Any]:
        # Try database first
        pool = get_sync_pool()
        if pool is not None:
            try:
                with pool.connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            "SELECT state FROM agent_workflow_states WHERE actor_id = %s AND workflow_id = %s",
                            (actor_id, workflow_id),
                        )
                        row = cur.fetchone()
                        if row and row[0]:
                            state = row[0] if isinstance(row[0], dict) else json.loads(row[0])
                            with self._lock:
                                self._items[(actor_id, workflow_id)] = deepcopy(state)
                            return deepcopy(state)
            except Exception as exc:
                logger.debug("Database read failed for workflow (%s, %s): %s", actor_id, workflow_id, exc)

        with self._lock:
            return deepcopy(self._items.get((actor_id, workflow_id), {}))

    def save(self, actor_id: str, workflow_id: str, state: dict[str, Any]) -> None:
        with self._lock:
            self._items[(actor_id, workflow_id)] = deepcopy(state)

        pool = get_sync_pool()
        if pool is not None:
            try:
                state_json = json.dumps(state, ensure_ascii=False)
                with pool.connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            INSERT INTO agent_workflow_states (actor_id, workflow_id, state, updated_at)
                            VALUES (%s, %s, %s::jsonb, NOW())
                            ON CONFLICT (actor_id, workflow_id)
                            DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
                            """,
                            (actor_id, workflow_id, state_json),
                        )
                        conn.commit()
            except Exception as exc:
                logger.debug("Database write failed for workflow (%s, %s): %s", actor_id, workflow_id, exc)

    def clear(self, actor_id: str, workflow_id: str) -> None:
        with self._lock:
            self._items.pop((actor_id, workflow_id), None)

        pool = get_sync_pool()
        if pool is not None:
            try:
                with pool.connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            "DELETE FROM agent_workflow_states WHERE actor_id = %s AND workflow_id = %s",
                            (actor_id, workflow_id),
                        )
                        conn.commit()
            except Exception as exc:
                logger.debug("Database delete failed for workflow (%s, %s): %s", actor_id, workflow_id, exc)


workflow_store = WorkflowStore()
