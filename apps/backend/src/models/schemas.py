from typing import Literal

from pydantic import BaseModel, Field

from src.models.conversation import AgentAction


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
