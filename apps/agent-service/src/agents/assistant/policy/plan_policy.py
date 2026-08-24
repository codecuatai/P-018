from __future__ import annotations

from ..contracts import (
    CapabilitySnapshot,
    CapabilityStatus,
    ConfirmationGate,
    PlanningDecision,
    PlanningPhase,
    StepKind,
)
from ..planning.dependencies import validate_dag


class PlanPolicyError(ValueError):
    pass


def validate_plan(
    decision: PlanningDecision,
    snapshot: CapabilitySnapshot,
) -> PlanningDecision:
    try:
        validate_dag(decision.tasks)
    except ValueError as exc:
        raise PlanPolicyError(str(exc)) from exc
    definitions = {item.name: item for item in snapshot.capabilities}
    for task in decision.tasks:
        for step in task.steps:
            if step.step_kind == StepKind.WAIT_FOR_CONFIRMATION:
                expected_gates = {
                    PlanningPhase.SERVICE_CONFIRMATION: ConfirmationGate.SERVICE_DETAILS,
                    PlanningPhase.PAYMENT_CONFIRMATION: ConfirmationGate.PAYMENT,
                    PlanningPhase.CANCELLATION_CONFIRMATION: ConfirmationGate.CANCELLATION,
                }
                if step.capability is not None or expected_gates.get(step.phase) != step.confirmation_gate:
                    raise PlanPolicyError("waiting step policy is invalid")
                continue
            if step.step_kind != StepKind.CAPABILITY or step.capability is None:
                raise PlanPolicyError("step kind is invalid")
            definition = definitions.get(step.capability)
            if definition is None or definition.status != CapabilityStatus.IMPLEMENTED:
                raise PlanPolicyError("plan selected an unavailable capability")
            if definition.domain != task.domain:
                raise PlanPolicyError("capability domain mismatch")
            if definition.risk_level != step.risk_ceiling:
                raise PlanPolicyError("model cannot change capability risk")
            if definition.confirmation_gate != step.confirmation_gate:
                raise PlanPolicyError("model cannot change confirmation gate")
            if (
                step.phase
                in {
                    PlanningPhase.FINAL_COMMIT,
                    PlanningPhase.PAYMENT_CONFIRMATION,
                    PlanningPhase.CANCELLATION_CONFIRMATION,
                }
                and step.confirmation_gate == ConfirmationGate.NONE
            ):
                raise PlanPolicyError("final step requires confirmation")
    return decision
