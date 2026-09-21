"""Registry of bounded domain workflows for the single Concierge Graph."""

from __future__ import annotations

from src.application.domains.clinic import clinic_workflow
from src.application.domains.contracts import Domain, DomainAvailability, DomainWorkflow
from src.application.domains.food import food_workflow
from src.application.domains.hotel import hotel_workflow
from src.application.domains.ride.workflow import ride_workflow


class WorkflowRegistry:
    def __init__(self, workflows: tuple[DomainWorkflow, ...] | None = None):
        self._workflows = workflows or (ride_workflow, food_workflow, hotel_workflow, clinic_workflow)
        self._by_domain = {workflow.domain: workflow for workflow in self._workflows}

    def resolve(self, message: str, session_id: str | None = None) -> DomainWorkflow | None:
        return next((workflow for workflow in self._workflows if workflow.matches(message, session_id)), None)

    def get(self, domain: Domain) -> DomainWorkflow:
        return self._by_domain[domain]

    @property
    def connected_domains(self) -> list[str]:
        return [workflow.domain.value for workflow in self._workflows if workflow.availability is DomainAvailability.CONNECTED]

    @property
    def capabilities(self) -> dict[str, str]:
        return {workflow.domain.value: workflow.availability.value for workflow in self._workflows}


workflow_registry = WorkflowRegistry()

