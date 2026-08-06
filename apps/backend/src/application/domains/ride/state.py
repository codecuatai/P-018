"""Structured, provenance-aware memory for the Ride workflow."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from src.application.domains.ride.contracts import Scenario, VehicleType
from src.contracts.chat import AgentAction


class SlotState(StrEnum):
    UNKNOWN = "unknown"
    KNOWN = "known"
    AMBIGUOUS = "ambiguous"
    INVALID = "invalid"
    DEFAULTED = "defaulted"


class SlotSource(StrEnum):
    USER = "user"
    GEOCODER = "geocoder"
    SERVICE = "service"
    SYSTEM = "system"


class SlotRecord(BaseModel):
    value: Any | None = None
    state: SlotState = SlotState.UNKNOWN
    source: SlotSource | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    updated_turn: int = Field(default=0, ge=0)


class TurnPatch(BaseModel):
    """Validated output from a future structured language interpreter."""

    intent: str = "inform"
    slot_updates: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    explicit_confirmation: bool = False
    corrections: list[str] = Field(default_factory=list)


class RideDraft(BaseModel):
    # Compatibility projection for the current v1 Ride Service.
    pickup_address: str | None = None
    dropoff_address: str | None = None
    vehicle_type: VehicleType = "CAR_4"
    promo_code: str | None = None
    scenario: Scenario = "HAPPY_PATH"
    latest_quote_id: str | None = None
    latest_booking_id: str | None = None
    latest_payment_intent_id: str | None = None
    fare_finalized: bool = False

    # v2 memory: source of truth for collected slot knowledge.
    slots: dict[str, SlotRecord] = Field(default_factory=dict)
    revision: int = Field(default=0, ge=0)
    pending_action: str | None = None

    _estimate_dependent_slots = {"pickup_address", "dropoff_address", "vehicle_type", "promo_code"}

    def remember(
        self,
        slot: str,
        value: Any,
        *,
        turn: int,
        source: SlotSource = SlotSource.USER,
        confidence: float = 1.0,
    ) -> bool:
        """Apply one fact and invalidate a stale quote when the trip changes."""
        previous = getattr(self, slot, None)
        changed = previous != value
        if hasattr(self, slot):
            setattr(self, slot, value)
        self.slots[slot] = SlotRecord(
            value=value,
            state=SlotState.KNOWN if value is not None else SlotState.UNKNOWN,
            source=source,
            confidence=confidence,
            updated_turn=turn,
        )
        if changed and slot in self._estimate_dependent_slots:
            self.revision += 1
            self.latest_quote_id = None
            if self.pending_action == "confirm_quote":
                self.pending_action = None
        return changed


class ConversationSnapshot(BaseModel):
    draft: RideDraft = Field(default_factory=RideDraft)
    last_action: AgentAction | None = None
    history: list[dict[str, str]] = Field(default_factory=list)
    turn: int = Field(default=0, ge=0)
    active_domain: str = "ride"
    last_patch: TurnPatch | None = None
