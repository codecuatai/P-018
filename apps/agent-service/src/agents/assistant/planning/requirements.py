from __future__ import annotations

from datetime import UTC, datetime

from ..contracts import (
    AuthoritativeFact,
    AuthorityRequirement,
    CoreAPlannedTask,
    Domain,
    Operation,
    PlannerContext,
    SemanticSlot,
    TaskDisposition,
)

SEMANTIC_REQUIREMENTS: dict[tuple[Domain, Operation], tuple[str, ...]] = {
    (Domain.FOOD, Operation.DISCOVER): ('query|dish_query',),
    (Domain.FOOD, Operation.CREATE): ('query|dish_query',),
    (Domain.FOOD, Operation.CANCEL): (),
    (Domain.FOOD, Operation.STATUS): (),
    (Domain.RESTAURANT, Operation.DISCOVER): ('location',),
    (Domain.RESTAURANT, Operation.CREATE): ('location', 'party_size', 'start_at'),
    (Domain.RESTAURANT, Operation.UPDATE): (),
    (Domain.RESTAURANT, Operation.CANCEL): (),
    (Domain.RESTAURANT, Operation.STATUS): (),
    (Domain.HEALTHCARE, Operation.DISCOVER): ('department',),
    (Domain.HEALTHCARE, Operation.CREATE): ('department',),
    (Domain.HEALTHCARE, Operation.CANCEL): (),
    (Domain.HEALTHCARE, Operation.STATUS): (),
    (Domain.RIDE, Operation.DISCOVER): ('pickup_address', 'dropoff_address'),
    (Domain.RIDE, Operation.CREATE): ('pickup_address', 'dropoff_address'),
    (Domain.RIDE, Operation.CANCEL): (),
    (Domain.RIDE, Operation.STATUS): (),
}


AUTHORITY_REQUIREMENTS: dict[tuple[Domain, Operation], tuple[AuthorityRequirement, ...]] = {
    (Domain.FOOD, Operation.CANCEL): (AuthorityRequirement(fact='order_id', required_version=True),),
    (Domain.FOOD, Operation.UPDATE): (AuthorityRequirement(fact='cart_id', required_version=True),),
    (Domain.FOOD, Operation.STATUS): (AuthorityRequirement(fact='order_id'),),
    (Domain.RESTAURANT, Operation.UPDATE): (
        AuthorityRequirement(fact='reservation_id', required_version=True),
    ),
    (Domain.RESTAURANT, Operation.CANCEL): (
        AuthorityRequirement(fact='reservation_id', required_version=True),
    ),
    (Domain.RESTAURANT, Operation.STATUS): (AuthorityRequirement(fact='reservation_id'),),
    (Domain.HEALTHCARE, Operation.CANCEL): (
        AuthorityRequirement(fact='appointment_id', required_version=True),
    ),
    (Domain.HEALTHCARE, Operation.STATUS): (AuthorityRequirement(fact='appointment_id'),),
    (Domain.RIDE, Operation.CANCEL): (
        AuthorityRequirement(fact='booking_id', required_version=True),
    ),
    (Domain.RIDE, Operation.STATUS): (AuthorityRequirement(fact='booking_id'),),
}


def semantic_values(task: CoreAPlannedTask) -> dict[str, object]:
    raw = task.semantic_slots.model_dump(exclude_none=True)
    return {
        key: value.value if isinstance(value, SemanticSlot) else value
        for key, value in raw.items()
    }


def task_facts(context: PlannerContext, task_ref: int) -> list[AuthoritativeFact]:
    task = next((item for item in context.tasks if item.task_ref == task_ref), None)
    return list(task.facts) if task else []


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
        if requirement.must_be_unexpired and fact.expires_at is not None:
            expiry = fact.expires_at
            if expiry.tzinfo is None:
                continue
            if expiry <= current:
                continue
        return fact
    return None


def apply_requirements(task: CoreAPlannedTask, context: PlannerContext) -> CoreAPlannedTask:
    values = semantic_values(task)
    missing_semantic: list[str] = []
    for expression in SEMANTIC_REQUIREMENTS.get((task.domain, task.operation), ()):
        alternatives = expression.split('|')
        if (
            task.domain == Domain.RIDE
            and expression == 'dropoff_address'
            and task.depends_on
        ):
            continue
        if not any(values.get(name) not in (None, '') for name in alternatives):
            missing_semantic.append(expression)

    facts = task_facts(context, task.task_ref)
    missing_authority = [
        requirement
        for requirement in AUTHORITY_REQUIREMENTS.get((task.domain, task.operation), ())
        if usable_fact(facts, requirement) is None
    ]
    disposition = (
        TaskDisposition.NEEDS_INFO
        if missing_semantic
        else TaskDisposition.WAITING
        if missing_authority
        else task.disposition
    )
    return task.model_copy(
        update={
            'missing_information': missing_semantic,
            'missing_authority': missing_authority,
            'disposition': disposition,
        }
    )
