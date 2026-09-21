"""Shared contracts for bounded NaviGo domain workflows."""

from __future__ import annotations

from enum import StrEnum
from typing import Protocol, runtime_checkable

from src.contracts.chat import AgentReply


class Domain(StrEnum):
    RIDE = "ride"
    FOOD = "food"
    HOTEL = "hotel"
    CLINIC = "clinic"


class DomainAvailability(StrEnum):
    CONNECTED = "connected"
    NOT_CONNECTED = "not_connected"


@runtime_checkable
class DomainWorkflow(Protocol):
    """A bounded workflow for one service domain, not a separate AI agent."""

    domain: Domain
    availability: DomainAvailability

    def matches(self, message: str, session_id: str | None = None) -> bool: ...

    async def handle(self, message: str, session_id: str | None = None) -> tuple[str, AgentReply]: ...
