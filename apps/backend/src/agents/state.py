from __future__ import annotations

from typing import TypedDict


class AgentState(TypedDict, total=False):
    """State passed through the concierge LangGraph."""

    query: str
    session_id: str
    context: str
    analysis: str
    response: str
    action: str
    missing_fields: list[str]
    data: dict
    error: str
    metadata: dict
