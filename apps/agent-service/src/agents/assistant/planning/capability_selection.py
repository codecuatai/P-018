from __future__ import annotations

from dataclasses import dataclass

from ..contracts import (
    AuthorityRequirement,
    CapabilityDefinition,
    CapabilitySnapshot,
    CapabilityStatus,
    ConfirmationGate,
    CoreAPlannedTask,
    Domain,
    Operation,
    PlannedStep,
    PlannerContext,
    PlanningPhase,
    RiskLevel,
    StepKind,
    TaskDisposition,
)
from .requirements import task_facts, usable_fact


def _cap(
    name: str,
    domain: Domain,
    risk: RiskLevel = RiskLevel.READ,
    gate: ConfirmationGate = ConfirmationGate.NONE,
    status: CapabilityStatus = CapabilityStatus.IMPLEMENTED,
) -> CapabilityDefinition:
    return CapabilityDefinition(
        name=name,
        domain=domain,
        schema_version="1",
        risk_level=risk,
        confirmation_gate=gate,
        status=status,
    )


def default_capability_snapshot() -> CapabilitySnapshot:
    """Observed unified Agent/Gateway capabilities, not raw service routes."""
    return CapabilitySnapshot(
        version="observed.v1",
        capabilities=[
            _cap("search_food", Domain.FOOD),
            _cap("view_menu", Domain.FOOD),
            _cap("view_menu_item", Domain.FOOD),
            _cap("list_food_delivery_addresses", Domain.FOOD),
            _cap("get_food_cart", Domain.FOOD),
            _cap("create_cart", Domain.FOOD, RiskLevel.REVERSIBLE_WRITE),
            _cap("add_to_cart", Domain.FOOD, RiskLevel.REVERSIBLE_WRITE),
            _cap("update_food_cart_item", Domain.FOOD, RiskLevel.REVERSIBLE_WRITE),
            _cap("remove_food_cart_item", Domain.FOOD, RiskLevel.REVERSIBLE_WRITE),
            _cap("apply_voucher", Domain.FOOD, RiskLevel.REVERSIBLE_WRITE),
            _cap("remove_food_voucher", Domain.FOOD, RiskLevel.REVERSIBLE_WRITE),
            _cap("quote_delivery", Domain.FOOD),
            _cap("preview_order", Domain.FOOD),
            _cap("get_food_order", Domain.FOOD),
            _cap("track_food_order", Domain.FOOD),
            _cap("preview_food_order_cancellation", Domain.FOOD),
            _cap("restaurant.search", Domain.RESTAURANT),
            _cap("restaurant.get", Domain.RESTAURANT),
            _cap("restaurant.check_availability", Domain.RESTAURANT),
            _cap(
                "restaurant.create_hold",
                Domain.RESTAURANT,
                RiskLevel.REVERSIBLE_WRITE,
                ConfirmationGate.SERVICE_DETAILS,
            ),
            _cap(
                "restaurant.create_reservation",
                Domain.RESTAURANT,
                RiskLevel.FINANCIAL_OR_FINAL,
                ConfirmationGate.FINAL_COMMIT,
            ),
            _cap(
                "restaurant.update_reservation",
                Domain.RESTAURANT,
                RiskLevel.FINANCIAL_OR_FINAL,
                ConfirmationGate.FINAL_COMMIT,
            ),
            _cap(
                "restaurant.reservation.get",
                Domain.RESTAURANT,
                status=CapabilityStatus.SKELETON,
            ),
            _cap(
                "restaurant.cancel_reservation",
                Domain.RESTAURANT,
                status=CapabilityStatus.SKELETON,
            ),
            _cap("healthcare.list_departments", Domain.HEALTHCARE),
            _cap("healthcare.list_slots", Domain.HEALTHCARE),
            _cap(
                "healthcare.hold_slot",
                Domain.HEALTHCARE,
                RiskLevel.REVERSIBLE_WRITE,
                ConfirmationGate.SERVICE_DETAILS,
            ),
            _cap(
                "healthcare.confirm_appointment",
                Domain.HEALTHCARE,
                RiskLevel.FINANCIAL_OR_FINAL,
                ConfirmationGate.PAYMENT,
            ),
            _cap(
                "healthcare.cancel_appointment",
                Domain.HEALTHCARE,
                RiskLevel.REVERSIBLE_WRITE,
                ConfirmationGate.CANCELLATION,
            ),
            _cap(
                "healthcare.appointment.get",
                Domain.HEALTHCARE,
                status=CapabilityStatus.SKELETON,
            ),
            _cap(
                "healthcare.update_appointment",
                Domain.HEALTHCARE,
                status=CapabilityStatus.SKELETON,
            ),
            _cap("ride.quote.create", Domain.RIDE),
            _cap(
                "ride.booking.prepare",
                Domain.RIDE,
                RiskLevel.REVERSIBLE_WRITE,
                ConfirmationGate.SERVICE_DETAILS,
            ),
            _cap("ride.booking.status.get", Domain.RIDE),
            _cap(
                "ride.booking.cancel.prepare",
                Domain.RIDE,
                RiskLevel.REVERSIBLE_WRITE,
                ConfirmationGate.CANCELLATION,
            ),
            _cap(
                "ride.booking.update",
                Domain.RIDE,
                status=CapabilityStatus.SKELETON,
            ),
        ],
    )


@dataclass(frozen=True)
class StepChoice:
    capability: str | None
    phase: PlanningPhase
    purpose: str
    authority: tuple[AuthorityRequirement, ...] = ()


def _has(facts: list, field: str, *, version: bool = False, fresh: bool = False) -> bool:
    return (
        usable_fact(
            facts,
            AuthorityRequirement(
                fact=field,
                required_version=version,
                must_be_unexpired=fresh,
            ),
        )
        is not None
    )


def _choose(task: CoreAPlannedTask, context: PlannerContext) -> StepChoice:
    facts = task_facts(context, task.task_ref)
    if task.operation == Operation.STATUS:
        return {
            Domain.FOOD: StepChoice("get_food_order", PlanningPhase.STATUS, "Đọc đơn đồ ăn"),
            Domain.RESTAURANT: StepChoice("restaurant.reservation.get", PlanningPhase.STATUS, "Đọc reservation"),
            Domain.HEALTHCARE: StepChoice("healthcare.appointment.get", PlanningPhase.STATUS, "Đọc lịch khám"),
            Domain.RIDE: StepChoice("ride.booking.status.get", PlanningPhase.STATUS, "Đọc booking xe"),
        }[task.domain]
    if task.operation == Operation.CANCEL:
        return {
            Domain.FOOD: StepChoice(
                "preview_food_order_cancellation", PlanningPhase.CANCELLATION_PREVIEW, "Xem trước hủy đơn"
            ),
            Domain.RESTAURANT: StepChoice(
                "restaurant.cancel_reservation", PlanningPhase.CANCELLATION_CONFIRMATION, "Hủy reservation"
            ),
            Domain.HEALTHCARE: StepChoice(
                "healthcare.cancel_appointment", PlanningPhase.CANCELLATION_CONFIRMATION, "Hủy lịch khám"
            ),
            Domain.RIDE: StepChoice(
                "ride.booking.cancel.prepare", PlanningPhase.CANCELLATION_PREVIEW, "Chuẩn bị hủy booking"
            ),
        }[task.domain]
    if task.operation == Operation.UPDATE:
        if task.domain == Domain.RIDE and getattr(task.semantic_slots, "stopover_address", None) is not None:
            return StepChoice(
                "ride.quote.create",
                PlanningPhase.QUOTE_OR_PREVIEW,
                "Tạo lại quote Ride với điểm dừng trung gian",
            )
        return {
            Domain.FOOD: StepChoice(
                "get_food_cart",
                PlanningPhase.SELECTION,
                "Đọc giỏ trước khi cập nhật",
            ),
            Domain.RESTAURANT: StepChoice(
                "restaurant.update_reservation",
                PlanningPhase.FINAL_COMMIT,
                "Cập nhật reservation",
                (AuthorityRequirement(fact="reservation_id", required_version=True),),
            ),
            Domain.HEALTHCARE: StepChoice(
                "healthcare.update_appointment",
                PlanningPhase.FINAL_COMMIT,
                "Healthcare chưa có capability cập nhật lịch",
            ),
            Domain.RIDE: StepChoice(
                "ride.booking.update",
                PlanningPhase.FINAL_COMMIT,
                "Ride chưa có capability cập nhật booking",
            ),
        }[task.domain]
    if task.domain == Domain.FOOD:
        if getattr(task.semantic_slots, "selection", None) is not None:
            return StepChoice("add_to_cart", PlanningPhase.DRAFT_WRITE, "Thêm lựa chọn authoritative vào giỏ")
        if not _has(facts, "restaurant_id"):
            return StepChoice("search_food", PlanningPhase.DISCOVERY, "Tìm món hoặc nhà hàng")
        if not _has(facts, "menu_item_id"):
            return StepChoice("view_menu", PlanningPhase.SELECTION, "Lấy menu authoritative")
        if not _has(facts, "cart_id", version=True):
            return StepChoice("create_cart", PlanningPhase.DRAFT_WRITE, "Tạo giỏ hàng nháp")
        if not _has(facts, "address_id"):
            address_reference = getattr(task.semantic_slots, "address_reference", None)
            if address_reference is None:
                return StepChoice(None, PlanningPhase.SERVICE_CONFIRMATION, "Hỏi người dùng muốn giao tới địa chỉ nào")
            return StepChoice("list_food_delivery_addresses", PlanningPhase.SELECTION, "Chọn địa chỉ thuộc actor")
        if not _has(facts, "preview_id", version=True, fresh=True):
            return StepChoice("preview_order", PlanningPhase.QUOTE_OR_PREVIEW, "Tạo order preview authoritative")
        return StepChoice(None, PlanningPhase.SERVICE_CONFIRMATION, "Chờ xác nhận chi tiết đơn")
    if task.domain == Domain.RESTAURANT:
        if getattr(task.semantic_slots, "selection", None) is not None:
            return StepChoice("restaurant.create_hold", PlanningPhase.DRAFT_WRITE, "Kiểm tra và giữ bàn đã chọn")
        if not _has(facts, "restaurant_id"):
            return StepChoice("restaurant.search", PlanningPhase.DISCOVERY, "Tìm nhà hàng")
        if not _has(facts, "availability_version", fresh=True):
            return StepChoice("restaurant.check_availability", PlanningPhase.AVAILABILITY, "Kiểm tra bàn trống")
        if not _has(facts, "hold_id", version=True, fresh=True):
            return StepChoice("restaurant.create_hold", PlanningPhase.DRAFT_WRITE, "Giữ bàn")
        return StepChoice("restaurant.create_reservation", PlanningPhase.FINAL_COMMIT, "Tạo reservation")
    if task.domain == Domain.HEALTHCARE:
        if getattr(task.semantic_slots, "selection", None) is not None:
            return StepChoice("healthcare.hold_slot", PlanningPhase.DRAFT_WRITE, "Giữ slot khám đã chọn")
        if not _has(facts, "department_id"):
            return StepChoice("healthcare.list_departments", PlanningPhase.DISCOVERY, "Tìm khoa")
        if not _has(facts, "slot_id", fresh=True):
            return StepChoice("healthcare.list_slots", PlanningPhase.SELECTION, "Tìm slot còn trống")
        if not _has(facts, "appointment_id", version=True, fresh=True):
            return StepChoice("healthcare.hold_slot", PlanningPhase.DRAFT_WRITE, "Giữ slot khám")
        if _has(facts, "payment_confirmed") and _has(facts, "appointment_id", fresh=True):
            return StepChoice(
                "healthcare.confirm_appointment", PlanningPhase.PAYMENT_CONFIRMATION, "Xác nhận lịch đã thanh toán"
            )
        return StepChoice(None, PlanningPhase.PAYMENT_CONFIRMATION, "Chờ payment confirmation")
    if not _has(facts, "quote_id", version=True, fresh=True):
        return StepChoice("ride.quote.create", PlanningPhase.QUOTE_OR_PREVIEW, "Tạo quote chuyến xe")
    if not _has(facts, "booking_id", version=True):
        return StepChoice(
            "ride.booking.prepare", PlanningPhase.SERVICE_CONFIRMATION, "Chuẩn bị booking sau xác nhận lần một"
        )
    return StepChoice(None, PlanningPhase.PAYMENT_CONFIRMATION, "Chờ xác nhận thanh toán lần hai")


def select_step(
    task: CoreAPlannedTask,
    context: PlannerContext,
    snapshot: CapabilitySnapshot,
) -> CoreAPlannedTask:
    if task.disposition != TaskDisposition.READY:
        return task.model_copy(update={"steps": []})
    choice = _choose(task, context)
    if choice.capability is None:
        step = PlannedStep(
            step_ref=0,
            purpose=choice.purpose,
            step_kind=StepKind.WAIT_FOR_CONFIRMATION,
            capability=None,
            phase=choice.phase,
            risk_ceiling=RiskLevel.FINANCIAL_OR_FINAL,
            confirmation_gate=(
                ConfirmationGate.PAYMENT
                if choice.phase == PlanningPhase.PAYMENT_CONFIRMATION
                else ConfirmationGate.SERVICE_DETAILS
            ),
        )
        return task.model_copy(update={"steps": [step], "disposition": TaskDisposition.WAITING})
    definition = next(
        (
            item
            for item in snapshot.capabilities
            if item.name == choice.capability
            and item.domain == task.domain
            and item.status == CapabilityStatus.IMPLEMENTED
        ),
        None,
    )
    if definition is None:
        return task.model_copy(
            update={
                "steps": [],
                "disposition": TaskDisposition.WAITING,
                "missing_information": [f"capability:{choice.capability}"],
            }
        )
    step = PlannedStep(
        step_ref=0,
        purpose=choice.purpose,
        step_kind=StepKind.CAPABILITY,
        capability=definition.name,
        phase=choice.phase,
        requires_authority=list(choice.authority),
        risk_ceiling=definition.risk_level,
        confirmation_gate=definition.confirmation_gate,
    )
    return task.model_copy(update={"steps": [step]})
