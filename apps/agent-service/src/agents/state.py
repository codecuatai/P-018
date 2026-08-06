from __future__ import annotations

from typing import Any, TypedDict


class AgentState(TypedDict, total=False):
    user_id: str
    conversation_id: str
    query: str
    messages: list[dict[str, str]]
    workflow_context: dict[str, Any]
    correlation_id: str | None
    intent: str
    confidence: float
    extracted_slots: dict[str, Any]
    missing_slots: list[str]
    selected_restaurant_id: str | None
    selected_menu_item_ids: list[str]
    cart_id: str | None
    delivery_address: str | None
    tool_calls: list[dict[str, Any]]
    tool_results: list[dict[str, Any]]
    selected_tools: list[dict[str, Any]]
    tool_registry: list[dict[str, Any]]
    model_tool_calls: list[dict[str, Any]]
    pending_confirmation: dict[str, Any] | None
    state_updates: dict[str, Any]
    response_type: str
    response: str
    data: dict[str, Any]
    error: str | None
    step_count: int
