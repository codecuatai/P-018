"""Models used by the conversational ride concierge."""

from enum import StrEnum

from pydantic import BaseModel, Field

from src.models.ride import Scenario, VehicleType


class AgentAction(StrEnum):
    CLARIFY = "clarify"
    QUOTE = "quote"
    MULTI_QUOTE = "multi_quote"
    BOOK = "book"
    STATUS = "status"
    CANCEL = "cancel"
    COMPLETE = "complete"
    HELP = "help"
    ERROR = "error"
    FARE_BREAKDOWN = "fare_breakdown"
    FINALIZE = "finalize"
    AUDIT = "audit"
    PAYMENT_INFO = "payment_info"


class RideDraft(BaseModel):
    pickup_address: str | None = None
    dropoff_address: str | None = None
    vehicle_type: VehicleType = "CAR_4"
    promo_code: str | None = None
    scenario: Scenario = "HAPPY_PATH"
    latest_quote_id: str | None = None
    latest_booking_id: str | None = None
    latest_payment_intent_id: str | None = None
    fare_finalized: bool = False


class ConversationSnapshot(BaseModel):
    draft: RideDraft = Field(default_factory=RideDraft)
    last_action: AgentAction | None = None
    history: list[dict[str, str]] = Field(default_factory=list)


class AgentReply(BaseModel):
    response: str
    action: AgentAction
    missing_fields: list[str] = Field(default_factory=list)
    data: dict = Field(default_factory=dict)
