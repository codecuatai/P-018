from __future__ import annotations

from ..contracts import (
    ClarificationNeed,
    CoreAInput,
    PlanningDecision,
    TaskDisposition,
    WorkflowRelation,
)
from ..policy.plan_policy import PlanPolicyError, validate_plan
from .capability_selection import select_step
from .dependencies import attach_dependencies, enforce_destination_authority
from .fallback import safe_skeleton, validated_discarded_task_refs
from .requirements import apply_requirements
from .task_decomposition import decompose


class CoreAPlanner:
    """Deterministic Core A kernel; it never dispatches a capability."""

    def plan(self, input_: CoreAInput) -> PlanningDecision:
        try:
            tasks = decompose(input_.semantic_turn)
            tasks = attach_dependencies(tasks, input_.semantic_turn)
            tasks = enforce_destination_authority(tasks)
            tasks = [apply_requirements(task, input_.planner_context) for task in tasks]
            tasks = [select_step(task, input_.planner_context, input_.capability_snapshot) for task in tasks]
            relation = self._relation(tasks)
            clarification = self._clarification(tasks, input_)
            decision = PlanningDecision(
                capability_catalog_version=input_.capability_snapshot.version,
                tasks=tasks,
                clarification_need=clarification,
                workflow_relation=relation,
                interaction_mode=input_.semantic_turn.interaction_mode,
                discarded_task_refs=validated_discarded_task_refs(
                    input_.semantic_turn,
                    input_.planner_context,
                ),
            )
            return validate_plan(decision, input_.capability_snapshot)
        except (ValueError, PlanPolicyError):
            fallback = safe_skeleton(input_.semantic_turn, input_.planner_context).model_copy(
                update={"capability_catalog_version": input_.capability_snapshot.version}
            )
            return validate_plan(fallback, input_.capability_snapshot)

    @staticmethod
    def _relation(tasks) -> WorkflowRelation:
        if len(tasks) <= 1:
            return WorkflowRelation.SINGLE_TASK
        dependent = [task for task in tasks if task.depends_on]
        if not dependent:
            return WorkflowRelation.INDEPENDENT_TASKS
        if len(dependent) == len(tasks) - 1:
            return WorkflowRelation.DEPENDENT_TASKS
        return WorkflowRelation.MIXED

    @staticmethod
    def _clarification(tasks, input_: CoreAInput) -> ClarificationNeed | None:
        if input_.semantic_turn.ambiguity:
            value = input_.semantic_turn.ambiguity[0]
            return ClarificationNeed(code=value.code, reason=value.detail)
        target = next(
            (
                task
                for task in tasks
                if task.disposition in {TaskDisposition.NEEDS_INFO, TaskDisposition.WAITING}
                and (task.missing_information or task.missing_authority)
            ),
            None,
        )
        if target is None:
            return None
        missing = list(target.missing_information)
        missing.extend(item.fact for item in target.missing_authority)
        return ClarificationNeed(
            task_ref=target.task_ref,
            code="CORE_A_REQUIREMENT_MISSING",
            missing_fields=missing,
            reason="Planner requires semantic input or authoritative context before continuing.",
        )
