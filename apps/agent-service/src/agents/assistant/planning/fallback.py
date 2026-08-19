from __future__ import annotations

from ..contracts import (
    ClarificationNeed,
    PlannerContext,
    PlanningDecision,
    SemanticTurn,
    WorkflowRelation,
)
from .dependencies import attach_dependencies, enforce_destination_authority
from .task_decomposition import decompose

_TERMINAL_CONTEXT_PHASES = {'COMPLETED', 'FAILED', 'BLOCKED', 'DISCARDED'}


def validated_discarded_task_refs(turn: SemanticTurn, context: PlannerContext) -> list[int]:
    context_by_ref = {task.task_ref: task for task in context.tasks}
    return [
        task_ref
        for task_ref in turn.discarded_task_refs
        if task_ref in context_by_ref
        and context_by_ref[task_ref].phase not in _TERMINAL_CONTEXT_PHASES
    ]


def safe_skeleton(turn: SemanticTurn, context: PlannerContext) -> PlanningDecision:
    '''Small deterministic fallback with no capability or side effect.'''
    tasks = enforce_destination_authority(attach_dependencies(decompose(turn), turn))
    relation = (
        WorkflowRelation.SINGLE_TASK
        if len(tasks) <= 1
        else WorkflowRelation.DEPENDENT_TASKS
        if tasks and all(task.depends_on for task in tasks[1:])
        else WorkflowRelation.MIXED
        if any(task.depends_on for task in tasks)
        else WorkflowRelation.INDEPENDENT_TASKS
    )
    clarification = None
    if turn.ambiguity:
        ambiguity = turn.ambiguity[0]
        clarification = ClarificationNeed(
            code=ambiguity.code,
            reason=ambiguity.detail,
        )
    return PlanningDecision(
        tasks=tasks,
        clarification_need=clarification,
        workflow_relation=relation,
        interaction_mode=turn.interaction_mode,
        discarded_task_refs=validated_discarded_task_refs(turn, context),
    )
