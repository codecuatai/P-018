from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from ..contracts import (
    Domain,
    FoodSemanticSlots,
    HealthcareSemanticSlots,
    InteractionMode,
    Operation,
    ReferenceResolution,
    RestaurantSemanticSlots,
    RideSemanticSlots,
    SemanticIntent,
    SemanticReference,
    SemanticSlot,
    SemanticTurn,
    SlotSource,
)


def _operation(text: str) -> Operation:
    folded = text.casefold()
    padded = " " + re.sub(r"[^\w\s]", " ", folded) + " "
    if any(f" {value} " in padded for value in ('hủy', 'huỷ', 'cancel')):
        return Operation.CANCEL
    if any(f" {value} " in padded for value in ('đổi', 'cập nhật', 'update')):
        return Operation.UPDATE
    if any(f" {value} " in padded for value in ('trạng thái', 'theo dõi', 'status', 'track')):
        return Operation.STATUS
    if any(f" {value} " in padded for value in ('đặt', 'gọi xe', 'giữ', 'book', 'order')):
        return Operation.CREATE
    return Operation.DISCOVER


def _slots(domain: Domain, raw: Any):
    values = raw if isinstance(raw, Mapping) else {}
    allowed = {
        Domain.FOOD: set(FoodSemanticSlots.model_fields),
        Domain.RESTAURANT: set(RestaurantSemanticSlots.model_fields),
        Domain.HEALTHCARE: set(HealthcareSemanticSlots.model_fields),
        Domain.RIDE: set(RideSemanticSlots.model_fields),
    }[domain]
    projected = {
        key: SemanticSlot(value=value, source=SlotSource.USER_EXPLICIT)
        for key, value in values.items()
        if key in allowed and isinstance(value, str | int | bool)
    }
    schema = {
        Domain.FOOD: FoodSemanticSlots,
        Domain.RESTAURANT: RestaurantSemanticSlots,
        Domain.HEALTHCARE: HealthcareSemanticSlots,
        Domain.RIDE: RideSemanticSlots,
    }[domain]
    return schema.model_validate(projected)


def semantic_turn_from_plan(
    tasks: Sequence[Any],
    *,
    language: str = "vi",
    interaction_mode: str = "service",
    discarded_task_refs: Sequence[int] = (),
) -> SemanticTurn:
    """Project the bounded legacy understanding result onto the Core B contract."""
    intents: list[SemanticIntent] = []
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
        intents.append(
            SemanticIntent(
                intent_ref=intent_ref,
                domain=domain,
                operation=_operation(normalized),
                goal=goal,
                normalized_request=normalized,
                slots=_slots(domain, value.get("extracted_slots")),
                references=references,
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
