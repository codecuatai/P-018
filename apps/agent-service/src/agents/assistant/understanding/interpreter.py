from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from src.agents.confirmation import is_explicit_confirmation

from ..contracts import (
    ConstraintStrength,
    Domain,
    FoodSemanticSlots,
    HealthcareSemanticSlots,
    InteractionMode,
    Operation,
    ReferenceResolution,
    RestaurantSemanticSlots,
    RideSemanticSlots,
    SemanticConstraint,
    SemanticIntent,
    SemanticReference,
    SemanticSlot,
    SemanticTurn,
    SlotSource,
)


def _operation(text: str) -> Operation:
    folded = text.casefold()
    padded = " " + re.sub(r"[^\w\s]", " ", folded) + " "
    if any(f" {value} " in padded for value in ("hủy", "huỷ", "cancel")):
        return Operation.CANCEL
    if any(f" {value} " in padded for value in ("đổi", "cập nhật", "update")):
        return Operation.UPDATE
    if any(f" {value} " in padded for value in ("trạng thái", "theo dõi", "status", "track")):
        return Operation.STATUS
    if any(f" {value} " in padded for value in ("đặt", "gọi xe", "giữ", "book", "order")):
        return Operation.CREATE
    return Operation.DISCOVER


def _operation_for_task(domain: Domain, normalized_request: str, slots: Mapping[str, Any]) -> Operation:
    operation = _operation(normalized_request)
    # A material stopover changes an unconfirmed route, so it must re-quote
    # rather than use the unavailable booking-update capability.
    if domain == Domain.RIDE and slots.get("stopover_address") is not None:
        return Operation.UPDATE
    return operation


def _context_values(conversation_state: Mapping[str, Any], current_location: Mapping[str, Any]) -> set[object]:
    values: set[object] = set()
    for address in conversation_state.get("saved_addresses", []):
        if not isinstance(address, Mapping):
            continue
        for key in ("label", "address_text", "latitude", "longitude"):
            value = address.get(key)
            if isinstance(value, str | int | float | bool):
                values.add(value)
    for key in ("address_text", "latitude", "longitude"):
        value = current_location.get(key)
        if isinstance(value, str | int | float | bool):
            values.add(value)
    return values


def _previous_values(conversation_state: Mapping[str, Any]) -> set[object]:
    values: set[object] = set()
    for task in conversation_state.get("tasks", []):
        if not isinstance(task, Mapping):
            continue
        slots = task.get("extracted_slots", {})
        if isinstance(slots, Mapping):
            values.update(value for value in slots.values() if isinstance(value, str | int | float | bool))
    return values


def _slot_source(
    field: str,
    value: object,
    *,
    user_message: str,
    context_values: set[object],
    previous_values: set[object],
) -> SlotSource:
    folded = user_message.casefold()
    plain = re.sub(r"[^a-z0-9\s]", " ", _ascii_fold(user_message))
    literal = isinstance(value, str) and value.strip() and (
        value.casefold() in folded or _ascii_fold(value).strip() in plain
    )
    normalized_explicit = (
        field == "vehicle_type" and any(token in plain for token in ("xe may", "4 cho", "bon cho", "7 cho", "bay cho"))
        or field in {"start_at", "appointment_date", "time_preference"} and bool(re.search(r"\b(?:\d{1,2}(?:\s*(?:gio|h)|:[0-5]\d)|hom nay|mai|ngay kia)\b", plain))
        or field == "address_reference" and any(token in plain for token in ("ve nha", "toi nha", "home"))
        or field == "delivery_preference" and any(token in plain for token in ("giao", "ship"))
        or field == "selection" and any(token in plain for token in ("chon", "lay"))
    )
    if literal or normalized_explicit:
        return SlotSource.USER_EXPLICIT
    if value in context_values:
        return SlotSource.AUTHORITATIVE_CONTEXT
    if value in previous_values:
        return SlotSource.CONVERSATION_REFERENCE
    return SlotSource.INFERRED_PREFERENCE


def _ascii_fold(value: str) -> str:
    import unicodedata

    normalized = unicodedata.normalize("NFD", value.casefold())
    return "".join("d" if char == "đ" else char for char in normalized if unicodedata.category(char) != "Mn")


def _slots(
    domain: Domain,
    raw: Any,
    *,
    user_message: str,
    conversation_state: Mapping[str, Any],
    current_location: Mapping[str, Any],
):
    values = raw if isinstance(raw, Mapping) else {}
    allowed = {
        Domain.FOOD: set(FoodSemanticSlots.model_fields),
        Domain.RESTAURANT: set(RestaurantSemanticSlots.model_fields),
        Domain.HEALTHCARE: set(HealthcareSemanticSlots.model_fields),
        Domain.RIDE: set(RideSemanticSlots.model_fields),
    }[domain]
    projected = {
        key: SemanticSlot(
            value=value,
            source=_slot_source(
                key,
                value,
                user_message=user_message,
                context_values=_context_values(conversation_state, current_location),
                previous_values=_previous_values(conversation_state),
            ),
        )
        for key, value in values.items()
        if key in allowed and isinstance(value, str | int | float | bool)
    }
    schema = {
        Domain.FOOD: FoodSemanticSlots,
        Domain.RESTAURANT: RestaurantSemanticSlots,
        Domain.HEALTHCARE: HealthcareSemanticSlots,
        Domain.RIDE: RideSemanticSlots,
    }[domain]
    return schema.model_validate(projected)


def _constraints(text: str) -> list[SemanticConstraint]:
    lowered = text.casefold()
    hard = ("dị ứng", "di ung", "không được", "khong duoc", "bắt buộc", "bat buoc", "tránh ", "tranh ")
    soft = ("ưu tiên", "uu tien", "nếu có thể", "neu co the", "thích ", "thich ")
    if any(marker in lowered for marker in hard):
        return [SemanticConstraint(strength=ConstraintStrength.HARD, text=text[:500], actionable=False)]
    if any(marker in lowered for marker in soft):
        return [SemanticConstraint(strength=ConstraintStrength.SOFT, text=text[:500], actionable=False)]
    return []


def semantic_turn_from_plan(
    tasks: Sequence[Any],
    *,
    language: str = "vi",
    interaction_mode: str = "service",
    discarded_task_refs: Sequence[int] = (),
    user_message: str = "",
    conversation_state: Mapping[str, Any] | None = None,
    current_location: Mapping[str, Any] | None = None,
) -> SemanticTurn:
    """Project the bounded legacy understanding result onto the Core B contract."""
    intents: list[SemanticIntent] = []
    safe_state = conversation_state or {}
    safe_location = current_location or {}
    for intent_ref, raw in enumerate(tasks[:4]):
        value = raw.model_dump() if hasattr(raw, "model_dump") else raw
        if not isinstance(value, Mapping):
            continue
        try:
            domain = Domain(str(value.get("domain", "")))
        except ValueError:
            continue
        normalized = str(value.get("normalized_request") or value.get("goal") or "").strip()
        goal = str(value.get("goal") or normalized).strip()
        if not normalized or not goal:
            continue
        dependencies = [
            item for item in value.get("depends_on", []) if isinstance(item, int) and 0 <= item < intent_ref
        ]
        references = []
        for dependency in dependencies:
            dependency_value = tasks[dependency]
            dependency_domain = (
                dependency_value.domain if hasattr(dependency_value, "domain") else dependency_value.get("domain")
            )
            references.append(
                SemanticReference(
                    expression="previous authoritative result",
                    reference_type="previous_result",
                    target_task_ref=dependency,
                    target_domain=Domain(str(dependency_domain)),
                    resolution=ReferenceResolution.RESOLVED,
                )
            )
        raw_slots = value.get("extracted_slots", {})
        extracted = raw_slots if isinstance(raw_slots, Mapping) else {}
        if any(
            extracted.get(key) is not None
            for key in ("pickup_latitude", "pickup_longitude")
        ) and safe_location:
            references.append(
                SemanticReference(
                    expression="current device location",
                    reference_type="current_location",
                    target_domain=domain,
                    resolution=ReferenceResolution.RESOLVED,
                )
            )
        elif any(slot_value in _context_values(safe_state, {}) for slot_value in extracted.values()):
            references.append(
                SemanticReference(
                    expression="saved address",
                    reference_type="saved_address",
                    target_domain=domain,
                    resolution=ReferenceResolution.RESOLVED,
                )
            )
        intents.append(
            SemanticIntent(
                intent_ref=intent_ref,
                domain=domain,
                operation=_operation_for_task(domain, normalized, extracted),
                goal=goal,
                normalized_request=normalized,
                slots=_slots(
                    domain,
                    value.get("extracted_slots"),
                    user_message=user_message,
                    conversation_state=safe_state,
                    current_location=safe_location,
                ),
                references=references,
                constraints=_constraints(normalized),
                explicit_confirmation_language=is_explicit_confirmation(normalized),
            )
        )
    safe_language = language if language in {"vi", "en", "mixed", "unknown"} else "unknown"
    try:
        safe_mode = InteractionMode(interaction_mode)
    except ValueError:
        safe_mode = InteractionMode.SERVICE
    safe_discarded_refs = sorted(
        {
            value
            for value in discarded_task_refs
            if isinstance(value, int) and not isinstance(value, bool) and 0 <= value < 8
        }
    )
    return SemanticTurn(
        intents=intents,
        language=safe_language,
        interaction_mode=safe_mode,
        discarded_task_refs=safe_discarded_refs,
    )
