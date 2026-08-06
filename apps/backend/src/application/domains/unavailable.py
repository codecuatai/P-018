"""Safe responses for domain APIs that are planned but not connected yet."""

from __future__ import annotations

from uuid import uuid4

from src.application.domains.contracts import Domain, DomainAvailability
from src.contracts.chat import AgentAction, AgentReply


class UnavailableDomainWorkflow:
    """Discusses a domain without inventing availability or calling an API."""

    availability = DomainAvailability.NOT_CONNECTED

    def __init__(self, domain: Domain, terms: tuple[str, ...], response: str):
        self.domain = domain
        self._terms = terms
        self._response = response

    def matches(self, message: str, session_id: str | None = None) -> bool:
        normalized = message.lower()
        return any(term in normalized for term in self._terms)

    async def handle(self, message: str, session_id: str | None = None) -> tuple[str, AgentReply]:
        return session_id or str(uuid4()), AgentReply(
            response=self._response,
            action=AgentAction.HELP,
            data={
                "domain": self.domain.value,
                "availability": self.availability.value,
                "next_capability": "consultation_only",
            },
        )
