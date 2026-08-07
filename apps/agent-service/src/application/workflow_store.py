from __future__ import annotations

from copy import deepcopy
from threading import RLock
from typing import Any


class WorkflowStore:
    """Process-local workflow store for the first multi-turn slice.

    The interface is intentionally repository-shaped so it can be replaced by
    the xone_agent checkpoint repository without changing graph code.
    """

    def __init__(self) -> None:
        self._items: dict[tuple[str, str], dict[str, Any]] = {}
        self._lock = RLock()

    def get(self, actor_id: str, workflow_id: str) -> dict[str, Any]:
        with self._lock:
            return deepcopy(self._items.get((actor_id, workflow_id), {}))

    def save(self, actor_id: str, workflow_id: str, state: dict[str, Any]) -> None:
        with self._lock:
            self._items[(actor_id, workflow_id)] = deepcopy(state)

    def clear(self, actor_id: str, workflow_id: str) -> None:
        with self._lock:
            self._items.pop((actor_id, workflow_id), None)


workflow_store = WorkflowStore()
