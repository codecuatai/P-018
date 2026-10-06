from __future__ import annotations

from datetime import UTC, datetime

from ..contracts import (
    AuthoritativeFact,
    AuthorityRequirement,
    CoreAPlannedTask,
    Domain,
    FactType,
    Operation,
    PlannerContext,
    SemanticSlot,
    TaskDisposition,
)

SEMANTIC_REQUIREMENTS: dict[tuple[Domain, Operation], tuple[str, ...]] = {
    # Discovery supports browsing the current menu with no keyword.
    (Domain.FOOD, Operation.DISCOVER): (),
    (Domain.FOOD, Operation.CREATE): ("query|dish_query",),
    (Domain.FOOD, Operation.CANCEL): (),
    (Domain.FOOD, Operation.STATUS): (),
    (Domain.RESTAURANT, Operation.DISCOVER): ("location|cuisine_query|cuisine_type|cuisine",),
    (Domain.RESTAURANT, Operation.CREATE): ("location", "party_size", "start_at"),
    (Domain.RESTAURANT, Operation.UPDATE): (),
    (Domain.RESTAURANT, Operation.CANCEL): (),
    (Domain.RESTAURANT, Operation.STATUS): (),
    (Domain.HEALTHCARE, Operation.DISCOVER): ("department",),
    (Domain.HEALTHCARE, Operation.CREATE): ("department",),
    (Domain.HEALTHCARE, Operation.CANCEL): (),
    (Domain.HEALTHCARE, Operation.STATUS): (),
    (Domain.RIDE, Operation.DISCOVER): ("pickup_address", "dropoff_address", "vehicle_type"),
    (Domain.RIDE, Operation.CREATE): ("pickup_address", "dropoff_address", "vehicle_type"),
    (Domain.RIDE, Operation.CANCEL): (),
    (Domain.RIDE, Operation.STATUS): (),
}


AUTHORITY_REQUIREMENTS: dict[tuple[Domain, Operation], tuple[AuthorityRequirement, ...]] = {
    (Domain.FOOD, Operation.CANCEL): (AuthorityRequirement(fact="order_id", required_version=True),),
    (Domain.FOOD, Operation.UPDATE): (AuthorityRequirement(fact="cart_id", required_version=True),),
    (Domain.FOOD, Operation.STATUS): (AuthorityRequirement(fact="order_id"),),
    (Domain.RESTAURANT, Operation.UPDATE): (AuthorityRequirement(fact="reservation_id", required_version=True),),
    (Domain.RESTAURANT, Operation.CANCEL): (AuthorityRequirement(fact="reservation_id", required_version=True),),
    (Domain.RESTAURANT, Operation.STATUS): (AuthorityRequirement(fact="reservation_id"),),
    (Domain.HEALTHCARE, Operation.CANCEL): (AuthorityRequirement(fact="appointment_id", required_version=True),),
    (Domain.HEALTHCARE, Operation.STATUS): (AuthorityRequirement(fact="appointment_id"),),
    (Domain.RIDE, Operation.CANCEL): (AuthorityRequirement(fact="booking_id", required_version=True),),
    (Domain.RIDE, Operation.STATUS): (AuthorityRequirement(fact="booking_id"),),
}


def semantic_values(task: CoreAPlannedTask) -> dict[str, object]:
    raw = task.semantic_slots.model_dump(exclude_none=True)
    return {key: value.value if isinstance(value, SemanticSlot) else value for key, value in raw.items()}


def task_facts(context: PlannerContext, task_ref: int) -> list[AuthoritativeFact]:
    task = next((item for item in context.tasks if item.task_ref == task_ref), None)
    return list(task.facts) if task else []


def selected_restaurant_facts(context: PlannerContext) -> list[AuthoritativeFact]:
    """Return facts for the active authoritative restaurant selection, if any."""
    for task in reversed(context.tasks):
        if task.domain != Domain.RESTAURANT or task.phase not in {
            "PLANNING", "NEEDS_INFO", "IN_PROGRESS", "AWAITING_CONFIRMATION",
        }:
            continue
        selected = [
            fact for fact in task.facts
            if fact.fact_type == FactType.SELECTED_CANDIDATE and fact.field == "restaurant_id"
        ]
        if selected:
            return selected
    return []


def usable_fact(
    facts: list[AuthoritativeFact],
    requirement: AuthorityRequirement,
    *,
    now: datetime | None = None,
) -> AuthoritativeFact | None:
    current = now or datetime.now(UTC)
    for fact in facts:
        if fact.field != requirement.fact:
            continue
        if requirement.required_version and fact.resource_version is None:
            continue
        if requirement.must_be_unexpired:
            expiry = fact.expires_at
            if expiry is None or expiry.tzinfo is None:
                continue
            if expiry <= current:
                continue
        return fact
    return None


def apply_requirements(task: CoreAPlannedTask, context: PlannerContext) -> CoreAPlannedTask:
    values = semantic_values(task)
    facts = task_facts(context, task.task_ref)
    if task.domain == Domain.RESTAURANT and task.operation == Operation.CREATE:
        if not any(fact.fact_type == FactType.SELECTED_CANDIDATE and fact.field == "restaurant_id" for fact in facts):
            facts = selected_restaurant_facts(context) or facts
    has_selected_restaurant = any(
        fact.fact_type == FactType.SELECTED_CANDIDATE and fact.field == "restaurant_id"
        for fact in facts
    )
    missing_semantic: list[str] = []
    for expression in SEMANTIC_REQUIREMENTS.get((task.domain, task.operation), ()):
        alternatives = expression.split("|")
        if (
            task.domain == Domain.RESTAURANT
            and task.operation == Operation.CREATE
            and expression == "location"
            and has_selected_restaurant
        ):
            continue
        if task.domain == Domain.RIDE and expression == "dropoff_address" and task.depends_on:
            continue
        if not any(values.get(name) not in (None, "") for name in alternatives):
            missing_semantic.append(expression)

    missing_authority = [
        requirement
        for requirement in AUTHORITY_REQUIREMENTS.get((task.domain, task.operation), ())
        if usable_fact(facts, requirement) is None
    ]
    missing_constraints = [
        f"constraint:{constraint.text}"
        for constraint in task.constraints
        if constraint.strength.value == "HARD" and not constraint.actionable
    ]
    missing_semantic.extend(missing_constraints)
    disposition = (
        TaskDisposition.NEEDS_INFO
        if missing_semantic
        else TaskDisposition.WAITING
        if missing_authority
        else task.disposition
    )
    return task.model_copy(
        update={
            "missing_information": missing_semantic,
            "missing_authority": missing_authority,
            "disposition": disposition,
        }
    )
