from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError
from src.agents.assistant.contracts import (
    AuthoritativeFact,
    CapabilitySnapshot,
    ConfirmationGate,
    CoreAInput,
    Domain,
    FactType,
    FoodSemanticSlots,
    HealthcareSemanticSlots,
    Operation,
    PlannerContext,
    PlannerTaskContext,
    ReferenceResolution,
    ReplanDirective,
    RestaurantSemanticSlots,
    RideSemanticSlots,
    RiskLevel,
    SemanticIntent,
    SemanticReference,
    SemanticSlot,
    SemanticTurn,
    SlotSource,
    StepKind,
    StepOutcome,
    StepOutcomeKind,
    TaskDisposition,
)
from src.agents.assistant.planning import CoreAPlanner, default_capability_snapshot
from src.agents.assistant.planning.replan import replan
from src.agents.assistant_graph import plan_core_a


def slot(value: str | int) -> SemanticSlot:
    return SemanticSlot(value=value, source=SlotSource.USER_EXPLICIT)


def input_for(
    *intents: SemanticIntent,
    context: PlannerContext | None = None,
    snapshot: CapabilitySnapshot | None = None,
) -> CoreAInput:
    return CoreAInput(
        semantic_turn=SemanticTurn(intents=list(intents), language='vi'),
        planner_context=context or PlannerContext(),
        capability_snapshot=snapshot or default_capability_snapshot(),
    )


def fact(
    field: str,
    value: str | int,
    *,
    version: str | int | None = None,
    fresh: bool = False,
) -> AuthoritativeFact:
    return AuthoritativeFact(
        fact_type=FactType.RESOURCE_SNAPSHOT,
        field=field,
        value=value,
        resource_version=version,
        expires_at=datetime.now(UTC) + timedelta(minutes=10) if fresh else None,
    )


def test_contract_rejects_fabricated_authoritative_food_field() -> None:
    with pytest.raises(ValidationError):
        FoodSemanticSlots.model_validate(
            {
                'query': {'value': 'phở', 'source': 'USER_EXPLICIT'},
                'restaurant_id': {'value': 'model-id', 'source': 'USER_EXPLICIT'},
            }
        )


def test_contract_rejects_slot_schema_for_wrong_domain() -> None:
    with pytest.raises(ValidationError):
        SemanticIntent(
            intent_ref=0,
            domain=Domain.RIDE,
            operation=Operation.CREATE,
            goal='Đặt xe',
            normalized_request='Đặt xe',
            slots=FoodSemanticSlots(query=slot('phở')),
        )


def test_food_discovery_selects_observed_read_capability() -> None:
    intent = SemanticIntent(
        intent_ref=0,
        domain=Domain.FOOD,
        operation=Operation.DISCOVER,
        goal='Tìm phở',
        normalized_request='Tìm phở dưới 100 nghìn',
        slots=FoodSemanticSlots(query=slot('phở'), max_price=slot(100000)),
    )
    decision = CoreAPlanner().plan(input_for(intent))
    step = decision.tasks[0].steps[0]
    assert step.capability == 'search_food'
    assert step.step_kind == StepKind.CAPABILITY
    assert step.risk_ceiling == RiskLevel.READ
    assert step.confirmation_gate == ConfirmationGate.NONE


def test_legacy_facade_exposes_typed_core_a_seam() -> None:
    intent = SemanticIntent(
        intent_ref=0,
        domain=Domain.FOOD,
        operation=Operation.DISCOVER,
        goal='Tìm phở',
        normalized_request='Tìm phở',
        slots=FoodSemanticSlots(query=slot('phở')),
    )
    assert plan_core_a(input_for(intent)).tasks[0].steps[0].capability == 'search_food'


def test_food_missing_address_stops_before_preview() -> None:
    intent = SemanticIntent(
        intent_ref=0,
        domain=Domain.FOOD,
        operation=Operation.CREATE,
        goal='Đặt phở',
        normalized_request='Đặt phở',
        slots=FoodSemanticSlots(query=slot('phở')),
    )
    context = PlannerContext(
        tasks=[
            PlannerTaskContext(
                task_ref=0,
                domain=Domain.FOOD,
                phase='IN_PROGRESS',
                facts=[
                    fact('restaurant_id', 'res-1'),
                    fact('menu_item_id', 'item-1'),
                    fact('cart_id', 'cart-1', version=2),
                ],
            )
        ]
    )
    decision = CoreAPlanner().plan(input_for(intent, context=context))
    assert decision.tasks[0].steps[0].step_kind == StepKind.WAIT_FOR_CONFIRMATION
    assert decision.tasks[0].steps[0].capability is None
    assert decision.tasks[0].steps[0].purpose == 'Hỏi người dùng muốn giao tới địa chỉ nào'
    assert all(step.capability != 'preview_order' for step in decision.tasks[0].steps)


def test_food_uses_saved_addresses_only_after_explicit_address_reference() -> None:
    intent = SemanticIntent(
        intent_ref=0,
        domain=Domain.FOOD,
        operation=Operation.CREATE,
        goal='Đặt phở giao về nhà',
        normalized_request='Đặt phở giao về nhà',
        slots=FoodSemanticSlots(query=slot('phở'), address_reference=slot('home')),
    )
    context = PlannerContext(tasks=[PlannerTaskContext(
        task_ref=0,
        domain=Domain.FOOD,
        phase='IN_PROGRESS',
        facts=[
            fact('restaurant_id', 'res-1'),
            fact('menu_item_id', 'item-1'),
            fact('cart_id', 'cart-1', version=2),
        ],
    )])

    step = CoreAPlanner().plan(input_for(intent, context=context)).tasks[0].steps[0]

    assert step.step_kind == StepKind.CAPABILITY
    assert step.capability == 'list_food_delivery_addresses'


def test_restaurant_final_commit_requires_fresh_authoritative_hold() -> None:
    intent = SemanticIntent(
        intent_ref=0,
        domain=Domain.RESTAURANT,
        operation=Operation.CREATE,
        goal='Đặt bàn',
        normalized_request='Đặt bàn tại Hoàn Kiếm cho 4 người lúc 19 giờ',
        slots=RestaurantSemanticSlots(
            location=slot('Hoàn Kiếm'),
            party_size=slot(4),
            start_at=slot('2026-08-13T19:00:00+07:00'),
        ),
    )
    context = PlannerContext(
        tasks=[
            PlannerTaskContext(
                task_ref=0,
                domain=Domain.RESTAURANT,
                phase='IN_PROGRESS',
                facts=[
                    fact('restaurant_id', 'restaurant-1'),
                    fact('availability_version', 'availability-1', fresh=True),
                    fact('hold_id', 'hold-1', version=1, fresh=True),
                ],
            )
        ]
    )
    step = CoreAPlanner().plan(input_for(intent, context=context)).tasks[0].steps[0]
    assert step.capability == 'restaurant.create_reservation'
    assert step.risk_ceiling == RiskLevel.FINANCIAL_OR_FINAL
    assert step.confirmation_gate == ConfirmationGate.FINAL_COMMIT


def test_confirmation_waiting_step_has_no_dispatchable_capability() -> None:
    intent = SemanticIntent(
        intent_ref=0,
        domain=Domain.FOOD,
        operation=Operation.CREATE,
        goal='Đặt phở',
        normalized_request='Đặt phở',
        slots=FoodSemanticSlots(query=slot('phở')),
    )
    context = PlannerContext(tasks=[PlannerTaskContext(
        task_ref=0,
        domain=Domain.FOOD,
        phase='AWAITING_CONFIRMATION',
        facts=[
            fact('restaurant_id', 'res-1'),
            fact('menu_item_id', 'item-1'),
            fact('cart_id', 'cart-1', version=1),
            fact('address_id', 'address-1'),
            fact('preview_id', 'preview-1', version=1, fresh=True),
        ],
    )])
    step = CoreAPlanner().plan(input_for(intent, context=context)).tasks[0].steps[0]
    assert step.step_kind == StepKind.WAIT_FOR_CONFIRMATION
    assert step.capability is None
    assert step.confirmation_gate == ConfirmationGate.SERVICE_DETAILS


def test_healthcare_to_ride_uses_dependency_not_model_destination() -> None:
    healthcare = SemanticIntent(
        intent_ref=0,
        domain=Domain.HEALTHCARE,
        operation=Operation.CREATE,
        goal='Đặt lịch khám',
        normalized_request='Khám thần kinh sáng mai',
        slots=HealthcareSemanticSlots(
            department=slot('thần kinh'),
            time_preference=slot('tomorrow_morning'),
        ),
    )
    ride = SemanticIntent(
        intent_ref=1,
        domain=Domain.RIDE,
        operation=Operation.CREATE,
        goal='Đi xe tới bệnh viện',
        normalized_request='Đi từ VinUni tới đó',
        slots=RideSemanticSlots(
            pickup_address=slot('VinUni'),
            dropoff_address=slot('bệnh viện đó'),
        ),
        references=[
            SemanticReference(
                expression='đó',
                reference_type='previous_result',
                target_task_ref=0,
                target_domain=Domain.HEALTHCARE,
                resolution=ReferenceResolution.RESOLVED,
            )
        ],
    )
    decision = CoreAPlanner().plan(input_for(healthcare, ride))
    planned_ride = decision.tasks[1]
    assert planned_ride.depends_on == [0]
    assert planned_ride.semantic_slots.dropoff_address is None
    assert 'dropoff_address' not in planned_ride.missing_information


def test_capability_present_only_as_skeleton_is_not_selected() -> None:
    intent = SemanticIntent(
        intent_ref=0,
        domain=Domain.RESTAURANT,
        operation=Operation.UPDATE,
        goal='Đổi lịch',
        normalized_request='Đổi lịch đặt bàn',
        slots=RestaurantSemanticSlots(),
    )
    context = PlannerContext(
        tasks=[
            PlannerTaskContext(
                task_ref=0,
                domain=Domain.RESTAURANT,
                phase='IN_PROGRESS',
                facts=[fact('reservation_id', 'reservation-1', version=2)],
            )
        ]
    )
    task = CoreAPlanner().plan(input_for(intent, context=context)).tasks[0]
    assert task.steps == []
    assert task.disposition == TaskDisposition.WAITING
    assert task.missing_information == ['capability:restaurant.update_reservation']


def test_stale_quote_invalidates_confirmation_and_requotes() -> None:
    intent = SemanticIntent(
        intent_ref=0,
        domain=Domain.RIDE,
        operation=Operation.CREATE,
        goal='Đặt xe',
        normalized_request='Đi từ VinUni đến Hồ Gươm',
        slots=RideSemanticSlots(
            pickup_address=slot('VinUni'),
            dropoff_address=slot('Hồ Gươm'),
        ),
    )
    original = CoreAPlanner().plan(input_for(intent))
    changed = replan(
        original,
        StepOutcome(
            task_ref=0,
            step_ref=0,
            capability='ride.booking.prepare',
            outcome=StepOutcomeKind.REJECTED,
            error_code='QUOTE_EXPIRED',
        ),
        PlannerContext(),
        default_capability_snapshot(),
    )
    assert changed.replan_directive == ReplanDirective.REQUOTE_OR_REPREVIEW
    assert changed.confirmation_invalidated is True


def test_unknown_payment_requires_reconciliation_not_new_payment() -> None:
    intent = SemanticIntent(
        intent_ref=0,
        domain=Domain.RIDE,
        operation=Operation.CREATE,
        goal='Đặt xe',
        normalized_request='Đặt xe',
        slots=RideSemanticSlots(
            pickup_address=slot('VinUni'),
            dropoff_address=slot('Hồ Gươm'),
        ),
    )
    original = CoreAPlanner().plan(input_for(intent))
    changed = replan(
        original,
        StepOutcome(
            task_ref=0,
            step_ref=0,
            capability='ride.booking.prepare',
            outcome=StepOutcomeKind.UNKNOWN,
        ),
        PlannerContext(),
        default_capability_snapshot(),
    )
    assert changed.replan_directive == ReplanDirective.RECONCILIATION_REQUIRED


def test_failed_dependency_blocks_ride_but_not_independent_food() -> None:
    restaurant = SemanticIntent(
        intent_ref=0,
        domain=Domain.RESTAURANT,
        operation=Operation.DISCOVER,
        goal='Tìm nhà hàng',
        normalized_request='Tìm nhà hàng ở Hoàn Kiếm',
        slots=RestaurantSemanticSlots(location=slot('Hoàn Kiếm')),
    )
    ride = SemanticIntent(
        intent_ref=1,
        domain=Domain.RIDE,
        operation=Operation.CREATE,
        goal='Đi tới đó',
        normalized_request='Đi từ VinUni tới đó',
        slots=RideSemanticSlots(pickup_address=slot('VinUni')),
        references=[
            SemanticReference(
                expression='đó',
                reference_type='previous_result',
                target_task_ref=0,
                target_domain=Domain.RESTAURANT,
                resolution=ReferenceResolution.RESOLVED,
            )
        ],
    )
    food = SemanticIntent(
        intent_ref=2,
        domain=Domain.FOOD,
        operation=Operation.DISCOVER,
        goal='Tìm phở',
        normalized_request='Tìm phở',
        slots=FoodSemanticSlots(query=slot('phở')),
    )
    original = CoreAPlanner().plan(input_for(restaurant, ride, food))
    changed = replan(
        original,
        StepOutcome(
            task_ref=0,
            step_ref=0,
            capability='restaurant.search',
            outcome=StepOutcomeKind.REJECTED,
            error_code='NOT_FOUND',
        ),
        PlannerContext(),
        default_capability_snapshot(),
    )
    assert changed.tasks[0].disposition == TaskDisposition.FAILED
    assert changed.tasks[1].disposition == TaskDisposition.BLOCKED
    assert changed.tasks[2].disposition != TaskDisposition.BLOCKED
    assert changed.blocked_task_refs == [1]
