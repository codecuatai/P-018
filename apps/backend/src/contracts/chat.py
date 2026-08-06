"""Public API and application reply contracts."""

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


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


class AgentReply(BaseModel):
    """Normalized reply produced by any domain or conversation agent."""

    response: str
    action: AgentAction
    missing_fields: list[str] = Field(default_factory=list)
    data: dict = Field(default_factory=dict)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="Tin nhan tu nguoi dung")
    session_id: str | None = Field(default=None, min_length=1, max_length=128)


class ChatResponse(BaseModel):
    response: str = Field(..., description="Phan hoi tu agent")
    analysis: str = Field(default="", description="Tom tat hanh dong cua agent")
    session_id: str = Field(..., description="Ma phien hoi thoai")
    action: AgentAction = AgentAction.HELP
    missing_fields: list[str] = Field(default_factory=list)
    data: dict = Field(default_factory=dict)


class RideActionRequest(BaseModel):
    """A deliberate UI action on the active ride quote."""

    action: Literal["confirm_quote", "cancel_quote"]
    session_id: str = Field(..., min_length=1, max_length=128)
    quote_id: str = Field(..., min_length=1, max_length=128)
