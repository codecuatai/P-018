from __future__ import annotations

from ..contracts import (
    ClarificationNeed,
    PlanningDecision,
    SemanticTurn,
    WorkflowRelation,
)
from .dependencies import attach_dependencies, enforce_destination_authority
from .task_decomposition import decompose


def safe_skeleton(turn: SemanticTurn) -> PlanningDecision:
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
    )
