from __future__ import annotations

from ..contracts import (
    CapabilitySnapshot,
    PlannerContext,
    PlanningDecision,
    ReplanDirective,
    StepOutcome,
    StepOutcomeKind,
    TaskDisposition,
)
from .dependencies import block_dependents

REQUOTE_CODES = {
    'CART_CHANGED',
    'PAYLOAD_MISMATCH',
    'QUOTE_EXPIRED',
    'CONFIRMATION_MISMATCH',
}
REFRESH_CODES = {
    'MENU_ITEM_UNAVAILABLE',
    'INVALID_OPTION',
    'DELIVERY_OUT_OF_RANGE',
    'CAPACITY_UNAVAILABLE',
    'HOLD_INVALID',
    'HOLD_PAYLOAD_MISMATCH',
    'SLOT_UNAVAILABLE',
    'APPOINTMENT_EXPIRED',
}
CONFIRMATION_CODES = {
    'CONFIRMATION_EXPIRED',
    'CONFIRMATION_ALREADY_USED',
    'CONFIRMATION_MISMATCH',
}
TERMINAL_CODES = {'FORBIDDEN', 'NOT_FOUND', 'RESERVATION_NOT_FOUND'}


def replan(
    previous: PlanningDecision,
    outcome: StepOutcome,
    _context: PlannerContext,
    _capabilities: CapabilitySnapshot,
) -> PlanningDecision:
    '''Map authoritative outcomes to a safe planning directive.

    Retry execution, idempotency keys and reconciliation scheduling remain
    Gateway responsibilities.
    '''
    code = outcome.error_code or ''
    if outcome.outcome == StepOutcomeKind.SUCCEEDED:
        return previous.model_copy(update={'replan_directive': ReplanDirective.CONTINUE})
    if outcome.outcome == StepOutcomeKind.UNKNOWN:
        return previous.model_copy(
            update={'replan_directive': ReplanDirective.RECONCILIATION_REQUIRED}
        )
    if code in REQUOTE_CODES:
        return previous.model_copy(
            update={
                'replan_directive': ReplanDirective.REQUOTE_OR_REPREVIEW,
                'confirmation_invalidated': True,
            }
        )
    if code in CONFIRMATION_CODES:
        return previous.model_copy(
            update={
                'replan_directive': ReplanDirective.ASK_USER,
                'confirmation_invalidated': True,
            }
        )
    if code in REFRESH_CODES:
        return previous.model_copy(
            update={
                'replan_directive': ReplanDirective.REFRESH_AUTHORITY,
                'confirmation_invalidated': code in {'HOLD_INVALID', 'HOLD_PAYLOAD_MISMATCH'},
            }
        )
    if outcome.retryable or outcome.outcome == StepOutcomeKind.RETRYABLE_FAILURE:
        return previous.model_copy(
            update={'replan_directive': ReplanDirective.WAIT_AND_RETRY_SAME_KEY}
        )
    if code in TERMINAL_CODES:
        tasks = []
        for task in previous.tasks:
            if task.task_ref == outcome.task_ref:
                tasks.append(task.model_copy(update={'disposition': TaskDisposition.FAILED, 'steps': []}))
            else:
                tasks.append(task)
        tasks = block_dependents(tasks, outcome.task_ref)
        blocked = [task.task_ref for task in tasks if task.disposition == TaskDisposition.BLOCKED]
        return previous.model_copy(
            update={
                'tasks': tasks,
                'replan_directive': (
                    ReplanDirective.BLOCK_DEPENDENTS
                    if blocked
                    else ReplanDirective.TERMINAL_FAILURE
                ),
                'blocked_task_refs': blocked,
            }
        )
    return previous.model_copy(update={'replan_directive': ReplanDirective.ASK_USER})
