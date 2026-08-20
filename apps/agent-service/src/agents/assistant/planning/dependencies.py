from __future__ import annotations

from ..contracts import (
    CoreAPlannedTask,
    Domain,
    ReferenceResolution,
    SemanticTurn,
    TaskDisposition,
)


def attach_dependencies(
    tasks: list[CoreAPlannedTask],
    turn: SemanticTurn,
) -> list[CoreAPlannedTask]:
    intent_to_task = {intent.intent_ref: task.task_ref for intent, task in zip(turn.intents, tasks, strict=False)}
    result: list[CoreAPlannedTask] = []
    for intent, task in zip(turn.intents, tasks, strict=False):
        dependencies: set[int] = set()
        for reference in intent.references:
            if (
                reference.resolution == ReferenceResolution.RESOLVED
                and reference.target_task_ref is not None
                and reference.target_task_ref in intent_to_task
            ):
                target = intent_to_task[reference.target_task_ref]
                if target < task.task_ref:
                    dependencies.add(target)
        result.append(task.model_copy(update={"depends_on": sorted(dependencies)}))
    validate_dag(result)
    return result


def enforce_destination_authority(tasks: list[CoreAPlannedTask]) -> list[CoreAPlannedTask]:
    """A dependent Ride destination must come from the prerequisite result."""
    result: list[CoreAPlannedTask] = []
    for task in tasks:
        if task.domain == Domain.RIDE and task.depends_on:
            slots = task.semantic_slots.model_copy(update={"dropoff_address": None})
            result.append(task.model_copy(update={"semantic_slots": slots}))
        else:
            result.append(task)
    return result


def validate_dag(tasks: list[CoreAPlannedTask]) -> None:
    refs = {task.task_ref for task in tasks}
    graph = {task.task_ref: list(task.depends_on) for task in tasks}
    for task_ref, dependencies in graph.items():
        if any(value not in refs or value == task_ref for value in dependencies):
            raise ValueError("dependency must reference another existing task")

    visiting: set[int] = set()
    visited: set[int] = set()

    def visit(node: int) -> None:
        if node in visiting:
            raise ValueError("dependency graph must be acyclic")
        if node in visited:
            return
        visiting.add(node)
        for dependency in graph[node]:
            visit(dependency)
        visiting.remove(node)
        visited.add(node)

    for task_ref in graph:
        visit(task_ref)


def block_dependents(
    tasks: list[CoreAPlannedTask],
    failed_task_ref: int,
) -> list[CoreAPlannedTask]:
    result: list[CoreAPlannedTask] = []
    blocked = {failed_task_ref}
    for task in tasks:
        blocker = next((ref for ref in task.depends_on if ref in blocked), None)
        if blocker is not None:
            blocked.add(task.task_ref)
            result.append(
                task.model_copy(
                    update={
                        "disposition": TaskDisposition.BLOCKED,
                        "blocking_task_ref": blocker,
                        "steps": [],
                    }
                )
            )
        else:
            result.append(task)
    return result
