from __future__ import annotations

import re
import unicodedata
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from ..models.schemas import ToolRequest
from .tool_ids import make_tool_call_id


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


def _fold(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value.lower())
    folded = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return folded.replace("đ", "d").replace("ð", "d")


def _ride_context(context: dict[str, Any]) -> dict[str, Any]:
    ride = context.get("ride")
    return dict(ride) if isinstance(ride, dict) else {}


def _extract(query: str, context: dict[str, Any]) -> dict[str, str]:
    ride = _ride_context(context)
    slots: dict[str, str] = {}
    route = re.search(r"\btừ\s+(.+?)\s+đến\s+(.+)$", query, re.IGNORECASE)
    if not route:
        route = re.search(r"\bfrom\s+(.+?)\s+to\s+(.+)$", query, re.IGNORECASE)
    if route:
        slots["pickup_address"] = route.group(1).strip(" .,!?")[:300]
        slots["dropoff_address"] = route.group(2).strip(" .,!?")[:300]
    else:
        pickup = re.search(r"(?:điểm đón|pickup)\s*[:：]\s*(.+?)(?:,|;|\s+điểm đến|\s+dropoff)\s*[:：]?", query, re.IGNORECASE)
        dropoff = re.search(r"(?:điểm đến|dropoff)\s*[:：]\s*(.+)$", query, re.IGNORECASE)
        if pickup:
            slots["pickup_address"] = pickup.group(1).strip(" .,!?")[:300]
        if dropoff:
            slots["dropoff_address"] = dropoff.group(1).strip(" .,!?")[:300]

    folded = _fold(query)
    if "xe may" in folded or "bike" in folded:
        slots["vehicle_type"] = "BIKE"
    elif "7 cho" in folded or "car_7" in folded or "car 7" in folded:
        slots["vehicle_type"] = "CAR_7"
    elif "4 cho" in folded or "car_4" in folded or "car 4" in folded:
        slots["vehicle_type"] = "CAR_4"

    promo = re.search(r"(?:ma|mã)\s*(?:khuyen mai|khuyến mãi|promo)?\s*[:：]?\s*([A-Za-z0-9_-]{2,50})", query, re.IGNORECASE)
    if promo:
        slots["promo_code"] = promo.group(1)

    for field in ("pickup_address", "dropoff_address", "vehicle_type", "promo_code"):
        if field not in slots and ride.get(field) not in (None, ""):
            slots[field] = str(ride[field])
    return slots


def _patch(context: dict[str, Any], slots: dict[str, str]) -> dict[str, Any]:
    ride = _ride_context(context)
    updates = [
        {"slot": field, "value": value, "source": "user", "confidence": 0.95}
        for field, value in slots.items()
        if value != ride.get(field)
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


def interpret_ride(state: RideAgentState) -> RideAgentState:
    query = str(state.get("query", ""))
    context = state.get("context", {})
    workflow_id = str(state.get("workflow_id", ""))
    turn_id = str(state.get("turn_id", "1"))
    ride = _ride_context(context)
    slots = _extract(query, context)
    patch = _patch(context, slots)
    missing = [field for field in ("pickup_address", "dropoff_address") if not slots.get(field)]
    if missing:
        labels = {"pickup_address": "địa chỉ đón", "dropoff_address": "địa chỉ đến"}
        return {
            "response": f"Bạn cho mình biết {labels[missing[0]]} để mình tính giá chuyến đi nhé.",
            "intent": "clarify_ride",
            "missing_fields": missing,
            "state_patch": patch,
            "tool_request": None,
        }

    folded = _fold(query)
    if ride.get("latest_booking_id") and any(term in folded for term in ("trang thai", "status", "tai xe")):
        return {
            "response": "Mình sẽ kiểm tra trạng thái chuyến đi của bạn.",
            "intent": "get_ride_status",
            "missing_fields": [],
            "state_patch": patch,
            "tool_request": _tool("ride.booking.status.get", "READ", {"booking_id": str(ride["latest_booking_id"])}, workflow_id, turn_id),
        }

    if not ride.get("latest_quote_id"):
        arguments: dict[str, Any] = {
            "pickup_address": slots["pickup_address"],
            "dropoff_address": slots["dropoff_address"],
            "vehicle_type": slots.get("vehicle_type", "CAR_4"),
        }
        if slots.get("promo_code"):
            arguments["promo_code"] = slots["promo_code"]
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
