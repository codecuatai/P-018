from __future__ import annotations

from typing import Any, TypedDict

from pydantic import BaseModel, Field


class RestaurantCandidate(BaseModel):
    id: str
    name: str = ""


class MenuItemCandidate(BaseModel):
    id: str
    name: str = ""
    restaurant_id: str | None = None


class FoodWorkflowContext(BaseModel):
    restaurant_id: str | None = None
    restaurant_candidates: list[RestaurantCandidate] = Field(default_factory=list)
    menu_item_id: str | None = None
    menu_item_candidates: list[MenuItemCandidate] = Field(default_factory=list)
    cart_id: str | None = None
    cart_items: list[dict[str, Any]] = Field(default_factory=list)
    address_id: str | None = None
    address_candidates: list[dict[str, Any]] = Field(default_factory=list)
    last_order_id: str | None = None
    last_payment_id: str | None = None
    pending_confirmation_id: str | None = None


class AgentState(TypedDict, total=False):
    user_id: str
    conversation_id: str
    query: str
    messages: list[dict[str, str]]
    workflow_context: dict[str, Any]
    correlation_id: str | None
    intent: str
    confidence: float
    decision_source: str
    extracted_slots: dict[str, Any]
    missing_slots: list[str]
    restaurant_id: str | None
    menu_item_id: str | None
    restaurant_candidates: list[dict[str, Any]]
    menu_item_candidates: list[dict[str, Any]]
    address_id: str | None
    address_candidates: list[dict[str, Any]]
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
    missing_options: list[str]
    ambiguity: str
    step_count: int
