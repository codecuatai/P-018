from __future__ import annotations

from typing import TypedDict


class ConciergeState(TypedDict, total=False):
    """Ephemeral state for one request through the Concierge Graph."""

    query: str
    session_id: str
    scope: str
    route: str
    domain: str
    trace: list[str]
    analysis: str
    response: str
    action: str
    missing_fields: list[str]
    data: dict
    error: str


# Compatibility alias for consumers that imported the old graph state name.
AgentState = ConciergeState
