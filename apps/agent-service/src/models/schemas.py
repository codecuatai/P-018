from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Food conversation contract used by the canonical gateway route."""

    message: str = Field(..., min_length=1, max_length=5000, description="Tin nhắn từ user")
    conversation_id: str = Field(..., min_length=1, max_length=128)
    user_id: str = Field(..., min_length=1, max_length=128)
    correlation_id: str | None = None
    messages: list[dict[str, str]] = Field(default_factory=list)
    workflow_context: dict[str, Any] = Field(default_factory=dict)


class RestaurantChatRequest(BaseModel):
    """Restaurant workflow contract kept separate from Food conversation state."""

    message: str = Field(..., min_length=1, max_length=5000, description="Tin nhắn từ user")
    workflow_id: str | None = Field(default=None, min_length=1, max_length=100)
    context: dict[str, Any] = Field(default_factory=dict)
    client_turn_id: str | None = Field(default=None, min_length=1, max_length=100)


class AgentResponse(BaseModel):
    response_type: Literal["text", "options", "cart", "order_preview", "confirmation_form", "tracking", "error"]
    message: str
    data: dict[str, Any] = Field(default_factory=dict)
    pending_confirmation: dict[str, Any] | None = None
    meta: dict[str, Any] = Field(default_factory=dict)
    response: str | None = None
    state_updates: dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    response: str = Field(..., description="Phản hồi từ agent")
    workflow_id: str
    intent: str | None = None
    slots: dict[str, Any] = Field(default_factory=dict)
    missing_slots: list[str] = Field(default_factory=list)
    tool_request: "ToolRequest | None" = None
    status: Literal["NEEDS_INPUT", "TOOL_REQUEST_READY", "COMPLETED"] = "COMPLETED"


class ToolRequest(BaseModel):
    tool_name: str = Field(min_length=1, max_length=100)
    risk_level: Literal["READ", "REVERSIBLE_WRITE", "FINANCIAL_OR_FINAL"]
    arguments: dict[str, Any]
    workflow_id: str = Field(min_length=1, max_length=100)
    tool_call_id: str = Field(min_length=1, max_length=100)
    schema_version: str = "1"
    idempotency_key: str | None = None


class ToolResult(BaseModel):
    tool_call_id: str
    tool_name: str
    data: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    received_at: datetime | None = None

