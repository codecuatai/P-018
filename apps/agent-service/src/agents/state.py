from __future__ import annotations

from typing import Any, TypedDict


class AgentState(TypedDict, total=False):
    """State schema cho LangGraph agent.

    Mỗi node đọc và ghi vào state này.
    total=False cho phép tất cả fields là optional.
    """

    query: str
    workflow_id: str
    turn_id: str
    actor_id: str
    context: dict[str, Any]
    intent: str
    slots: dict[str, Any]
    missing_slots: list[str]
    tool_request: dict[str, Any]
    tool_result: dict[str, Any]
    response: str
    error: str
    status: str
    unsupported: bool
