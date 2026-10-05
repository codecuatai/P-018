from __future__ import annotations

import re
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph
from pydantic import BaseModel, ConfigDict, Field

from src.agents.tool_ids import make_tool_call_id
from src.models.schemas import ToolRequest


class RideAgentState(TypedDict, total=False):
    query: str
    workflow_id: str
    turn_id: str
    context: dict[str, Any]
    response: str
    intent: str
    missing_fields: list[str]
    state_patch: dict[str, Any]
    tool_request: dict[str, Any] | None


class RideSlotPatch(BaseModel):
    """Semantic fields extracted from the latest user turn."""

    model_config = ConfigDict(extra="forbid")

    pickup_address: str | None = Field(default=None, max_length=300)
    dropoff_address: str | None = Field(default=None, max_length=300)
    vehicle_type: str | None = None
    passenger_count: int | None = Field(default=None, ge=1, le=99)
    promo_code: str | None = Field(default=None, max_length=50)
    provider: str | None = None


class RideResolution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intent: str
    slot_patch: RideSlotPatch = Field(default_factory=RideSlotPatch)
    status_query: bool = False


def _ride_context(context: dict[str, Any]) -> dict[str, Any]:
    ride = context.get("ride")
    return dict(ride) if isinstance(ride, dict) else {}


def _patch(context: dict[str, Any], slots: dict[str, Any]) -> dict[str, Any]:
    ride = _ride_context(context)
    semantic_fields = {
        "pickup_address", "dropoff_address", "vehicle_type", "passenger_count", "promo_code", "provider"
    }
    updates = [
        {"slot": field, "value": value, "source": "user", "confidence": 1.0}
        for field, value in slots.items()
        if field in semantic_fields and value != ride.get(field)
    ]
    revision = int(ride.get("revision", 0) or 0)
    return {
        "active_domain": "ride",
        "slot_updates": updates,
        "clear_fields": [],
        "revision": revision + (1 if updates else 0),
        "pending_action": "ride.quote.create" if not ride.get("latest_quote_id") else ride.get("pending_action"),
    }


def _tool(tool_name: str, risk_level: str, arguments: dict[str, Any], workflow_id: str, turn_id: str) -> dict[str, Any]:
    return ToolRequest(
        tool_name=tool_name,
        risk_level=risk_level,  # type: ignore[arg-type]
        arguments=arguments,
        workflow_id=workflow_id,
        tool_call_id=make_tool_call_id(workflow_id, turn_id),
    ).model_dump()


async def interpret_ride(state: RideAgentState) -> RideAgentState:
    query = str(state.get("query", ""))
    context = state.get("context", {})
    workflow_id = str(state.get("workflow_id", ""))
    turn_id = str(state.get("turn_id", "1"))
    ride = _ride_context(context)
    try:
        from src.config import get_settings
        from src.services.llm import GeminiAdapter

        if get_settings().agent_model_mode != "gemini":
            folded = query.lower().replace("đ", "d")
            pickup = dropoff = vehicle = None
            route = re.search(r"\bfrom\s+(.+?)\s+to\s+(.+?)(?:\s+by\s+|\s+for\s+|$)", query, re.IGNORECASE)
            if route:
                pickup, dropoff = route.group(1).strip(" ,."), route.group(2).strip(" ,.")
            else:
                route = re.search(r"\b(?:tu|từ)\s+(.+?)\s+\b(?:den|đến)\s+(.+?)(?=\s+(?:cho|for)\s+\d+\s+|$)", query, re.IGNORECASE)
                if route:
                    pickup, dropoff = route.group(1).strip(" ,."), route.group(2).strip(" ,.")
            if "7 cho" in folded or re.search(r"\b7\s+chỗ\b", query, re.IGNORECASE) or "car 7" in folded:
                vehicle = "CAR_7"
            elif "car 4" in folded or "4 cho" in folded or re.search(r"\b4\s+chỗ\b", query, re.IGNORECASE):
                vehicle = "CAR_4"
            elif "xe may" in folded or "bike" in folded:
                vehicle = "BIKE"
            passengers = re.search(
                r"\b(?:cho|for)\s+(\d+)\s+(?:người|nguoi|people|passengers)\b",
                query,
                re.IGNORECASE,
            )
            patch = {
                key: value
                for key, value in {
                    "pickup_address": pickup,
                    "dropoff_address": dropoff,
                    "vehicle_type": vehicle,
                    "passenger_count": int(passengers.group(1)) if passengers else None,
                }.items()
                if value is not None
            }
            resolution = RideResolution(
                intent="ride" if any(term in folded for term in ("xe", "from ", "tu ", "từ ")) else "other",
                slot_patch=patch,
            )
        else:
            prompt = (
                "Interpret the latest ride-service message using all supplied context. Extract only values stated or clearly "
                "implied by this message, resolving references against existing ride state. Classify whether the user asks "
                "for ride status. Do not invent addresses, providers, promo codes, IDs, or intent. vehicle_type must be "
                "BIKE, CAR_4, or CAR_7 when clear; otherwise null. Use intent=ride for ride requests or follow-ups and "
                "intent=other for unrelated messages. Return only the schema.\n"
                f"Existing ride state: {ride}\nOther context: {context}\nLatest user message: {query}"
            )
            raw = await GeminiAdapter().ainvoke_structured(prompt, RideResolution)
            if isinstance(raw, dict) and raw.get("parsed") is not None:
                raw = raw["parsed"]
            resolution = raw if isinstance(raw, RideResolution) else RideResolution.model_validate(raw)
    except Exception:
        return {
            "response": "Mình chưa hiểu đủ thông tin chuyến xe. Bạn nói rõ điểm đón, điểm đến và loại xe giúp mình nhé.",
            "intent": "clarify_ride",
            "missing_fields": ["pickup_address", "dropoff_address", "vehicle_type"],
            "state_patch": {
                "active_domain": "ride", "slot_updates": [], "clear_fields": [],
                "revision": int(ride.get("revision", 0) or 0),
            },
            "tool_request": None,
        }

    if resolution.intent != "ride":
        return {
            "response": "Mình có thể giúp đặt hoặc theo dõi chuyến xe. Bạn muốn làm gì tiếp theo?",
            "intent": "help",
            "missing_fields": [],
            "state_patch": {
                "active_domain": "ride", "slot_updates": [], "clear_fields": [],
                "revision": int(ride.get("revision", 0) or 0),
            },
            "tool_request": None,
        }

    slots: dict[str, Any] = dict(ride)
    semantic_patch = resolution.slot_patch.model_dump(exclude_none=True)
    if semantic_patch.get("vehicle_type") not in {"BIKE", "CAR_4", "CAR_7"}:
        semantic_patch.pop("vehicle_type", None)
    for field, value in semantic_patch.items():
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ""):
            slots[field] = value
    slots = {key: value for key, value in slots.items() if value not in (None, "")}
    patch = _patch(context, slots)
    missing = [field for field in ("pickup_address", "dropoff_address", "vehicle_type") if not slots.get(field)]
    if missing:
        return {
            "response": "Bạn cho mình biết các thông tin chuyến đi còn thiếu nhé.",
            "intent": "clarify_ride",
            "missing_fields": missing,
            "state_patch": patch,
            "tool_request": None,
        }

    if ride.get("latest_booking_id") and resolution.status_query:
        return {
            "response": "Mình sẽ kiểm tra trạng thái chuyến đi của bạn.",
            "intent": "get_ride_status",
            "missing_fields": [],
            "state_patch": patch,
            "tool_request": _tool(
                "ride.booking.status.get", "READ", {"booking_id": str(ride["latest_booking_id"])}, workflow_id, turn_id
            ),
        }

    if not ride.get("latest_quote_id"):
        arguments: dict[str, Any] = {
            "pickup_address": slots["pickup_address"],
            "dropoff_address": slots["dropoff_address"],
            "vehicle_type": slots["vehicle_type"],
        }
        for field in ("promo_code", "provider"):
            if slots.get(field):
                arguments[field] = slots[field]
        if slots.get("passenger_count"):
            arguments["passenger_count"] = int(slots["passenger_count"])
        return {
            "response": "Mình sẽ lấy báo giá chính thức cho chuyến đi này.",
            "intent": "request_ride_quote",
            "missing_fields": [],
            "state_patch": patch,
            "tool_request": _tool("ride.quote.create", "READ", arguments, workflow_id, turn_id),
        }

    return {
        "response": "Báo giá đã sẵn sàng. Bạn kiểm tra thông tin rồi xác nhận dịch vụ bằng nút bên dưới nhé.",
        "intent": "prepare_ride_booking",
        "missing_fields": [],
        "state_patch": patch,
        "tool_request": None,
    }


def build_ride_graph():
    graph = StateGraph(RideAgentState)
    graph.add_node("interpret", interpret_ride)
    graph.set_entry_point("interpret")
    graph.add_edge("interpret", END)
    return graph.compile()


agent = build_ride_graph()
