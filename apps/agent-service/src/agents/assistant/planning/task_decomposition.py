from __future__ import annotations

from ..contracts import CoreAPlannedTask, SemanticTurn, TaskDisposition


def decompose(turn: SemanticTurn) -> list[CoreAPlannedTask]:
    '''Convert semantic intents into planner tasks without inventing authority.'''
    tasks: list[CoreAPlannedTask] = []
    for task_ref, intent in enumerate(turn.intents[:4]):
        tasks.append(
            CoreAPlannedTask(
                task_ref=task_ref,
                domain=intent.domain,
                operation=intent.operation,
                goal=intent.goal,
                normalized_request=intent.normalized_request,
                semantic_slots=intent.slots,
                disposition=TaskDisposition.READY,
            )
        )
    return tasks
