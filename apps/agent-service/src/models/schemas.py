from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="Tin nhắn từ user")
    conversation_id: str = Field(default="conv_demo", min_length=1, max_length=128)
    user_id: str = Field(default="usr_demo_001", min_length=1, max_length=128)
    correlation_id: str | None = None
    messages: list[dict[str, str]] = Field(default_factory=list)
    workflow_context: dict[str, Any] = Field(default_factory=dict)


class AgentResponse(BaseModel):
    response_type: Literal["text", "options", "cart", "order_preview", "confirmation_form", "tracking", "error"]
    message: str
    data: dict[str, Any] = Field(default_factory=dict)
    pending_confirmation: dict[str, Any] | None = None
    meta: dict[str, Any] = Field(default_factory=dict)
    response: str | None = None
    state_updates: dict[str, Any] = Field(default_factory=dict)


ChatResponse = AgentResponse
