from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from src.agents.policies.tool_policy import validate_tool_request
from src.agents.state import AgentState
from src.agents.tool_ids import make_tool_call_id
from src.models.schemas import ToolRequest

TZ = timezone(timedelta(hours=7))


class RestaurantSlotPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    location: str | None = Field(default=None, min_length=1, max_length=300)
    cuisine_type: str | None = Field(default=None, min_length=1, max_length=200)
    budget_range: str | None = Field(default=None, min_length=1, max_length=120)
    party_size: int | None = Field(default=None, ge=1, le=20)
    local_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    local_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    duration_minutes: int | None = Field(default=None, ge=15, le=480)
    seating_type: str | None = Field(default=None, min_length=1, max_length=80)
    special_requests: str | None = Field(default=None, min_length=1, max_length=500)
    restaurant_name: str | None = None


class RestaurantResolution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intent: Literal["restaurant", "other"]
    slot_patch: RestaurantSlotPatch = Field(default_factory=RestaurantSlotPatch)
    explicit_confirmation: bool = False
    # A zero-based index into the latest authoritative restaurant search result.
    selected_index: int | None = Field(default=None, ge=0, le=100)


def _tool_outcome(result: dict[str, Any]) -> str:
    if result.get("error"):
        return str(result["error"])
    data = result.get("data", result)
    if isinstance(data, dict) and "items" in data and not data.get("items"):
        return "EMPTY_RESULT"
    return "SUCCEEDED"


def _tool_request(
    name: str,
    risk: str,
    arguments: dict[str, Any],
    state: AgentState,
    *,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    return validate_tool_request(
        ToolRequest(
            tool_name=name,
            risk_level=risk,  # type: ignore[arg-type]
            arguments=arguments,
            workflow_id=state["workflow_id"],
            tool_call_id=make_tool_call_id(state["workflow_id"], state.get("turn_id", "1")),
            idempotency_key=idempotency_key,
        )
    ).model_dump()


async def classify_and_extract(state: AgentState) -> dict[str, Any]:
    query = str(state.get("query", ""))
    context = dict(state.get("context", {}))
    prior = context.get("slots", state.get("slots", {}))
    prior = dict(prior) if isinstance(prior, dict) else {}
    tool_result = context.get("tool_result")
    now = datetime.now(TZ).isoformat()
    try:
        from src.config import get_settings
        from src.services.llm import GeminiAdapter

        if get_settings().agent_model_mode != "gemini":
            raise RuntimeError("LLM interpretation is disabled")
        prompt = (
            "Interpret the latest message for a restaurant reservation workflow from meaning and full context. "
            "Extract only semantic values stated or clearly implied; resolve short follow-ups against existing slots "
            "and the pending operation. Return dates as YYYY-MM-DD and local time as HH:MM using the supplied current "
            "time and timezone. Never invent IDs, availability, prices, or tool results. Select a search result only by "
            "zero-based index when the user clearly refers to it. Set explicit_confirmation only for clear approval of "
            "the exact pending action; questions, corrections, hesitation, or unrelated replies are not confirmation. "
            "Use intent=other for unrelated requests.\n"
            f"Current local time: {now}\nExisting workflow context: {context}\nExisting reservation slots: {prior}"
            f"\nLatest authoritative tool result: {tool_result}\nLatest user message: {query}"
        )
        raw = await GeminiAdapter().ainvoke_structured(prompt, RestaurantResolution)
        if isinstance(raw, dict) and raw.get("parsed") is not None:
            raw = raw["parsed"]
        resolution = raw if isinstance(raw, RestaurantResolution) else RestaurantResolution.model_validate(raw)
    except Exception:
        return {
            "intent": state.get("intent") or "restaurant_booking", "slots": prior,
            "missing_slots": ["request_clarification"], "status": "NEEDS_INPUT",
        }

    if resolution.intent == "other":
        return {"intent": "general_chat", "slots": prior, "status": "COMPLETED"}
    slots: dict[str, Any] = dict(prior)
    slots.update(resolution.slot_patch.model_dump(exclude_none=True))
    tool_name = context.get("tool_name")

    if context.get("tool_result_only") and tool_result is not None:
        return {
            "status": "COMPLETED", "outcome": _tool_outcome(tool_result),
            "intent": state.get("intent") or "restaurant_booking", "slots": prior,
        }

    if tool_result is not None and tool_name == "restaurant.search":
        data = tool_result.get("data", tool_result) if isinstance(tool_result, dict) else {}
        items = data.get("items", []) if isinstance(data, dict) else []
        index = resolution.selected_index
        if index is not None and index < len(items) and isinstance(items[index], dict):
            selected = items[index]
            slots["restaurant_id"] = selected.get("id")
            slots["restaurant_name"] = selected.get("name")
    if tool_result is not None and tool_name == "restaurant.check_availability" and resolution.explicit_confirmation:
        arguments = {key: slots[key] for key in ("restaurant_id", "party_size", "start_at", "duration_minutes") if key in slots}
        return {
            "intent": "restaurant_booking", "slots": slots, "status": "TOOL_REQUEST_READY",
            "tool_request": _tool_request(
                "restaurant.create_hold", "REVERSIBLE_WRITE", arguments, state,
                idempotency_key=f"hold-{state['workflow_id']}-{state.get('turn_id', '1')}",
            ),
        }
    if tool_result is not None and tool_name == "restaurant.create_hold" and resolution.explicit_confirmation:
        hold_data = tool_result.get("data", tool_result) if isinstance(tool_result, dict) else {}
        arguments = {
            "restaurant_id": slots.get("restaurant_id"), "party_size": slots.get("party_size"),
            "start_at": slots.get("start_at"), "duration_minutes": slots.get("duration_minutes", 120),
            "hold_id": hold_data.get("id") if isinstance(hold_data, dict) else None,
        }
        return {
            "intent": "restaurant_booking", "slots": slots, "status": "TOOL_REQUEST_READY",
            "tool_request": _tool_request(
                "restaurant.create_reservation", "FINANCIAL_OR_FINAL", arguments, state,
                idempotency_key=f"reservation-{state['workflow_id']}-{state.get('turn_id', '1')}",
            ),
        }

    if slots.get("local_date") and slots.get("local_time"):
        try:
            parsed = datetime.fromisoformat(f"{slots['local_date']}T{slots['local_time']}:00+07:00")
            slots["start_at"] = parsed.isoformat()
        except ValueError:
            slots.pop("start_at", None)
    missing = [name for name in ("party_size", "local_date", "local_time", "location") if not slots.get(name)]
    if missing:
        return {"intent": "restaurant_booking", "slots": slots, "missing_slots": missing, "status": "NEEDS_INPUT"}

    if slots.get("restaurant_id"):
        name = "restaurant.check_availability"
        arguments = {key: slots[key] for key in ("restaurant_id", "party_size", "start_at", "duration_minutes") if key in slots}
    else:
        name = "restaurant.search"
        arguments = {key: slots[key] for key in ("location", "party_size", "start_at", "duration_minutes") if key in slots}
        arguments["limit"] = 10
    return {
        "intent": "restaurant_booking", "slots": slots, "missing_slots": [], "status": "TOOL_REQUEST_READY",
        "tool_request": _tool_request(name, "READ", arguments, state),
    }


def compose_restaurant_response(state: AgentState) -> dict[str, Any]:
    phase = "PLANNING"
    outcome = "UNKNOWN"
    missing = []
    error_code = None
    if state.get("status") == "NEEDS_INPUT":
        phase, missing = "NEEDS_INFO", state.get("missing_slots", [])
    elif state.get("status") == "TOOL_REQUEST_READY":
        phase = "IN_PROGRESS"
    elif state.get("intent") == "general_chat":
        phase, error_code = "FAILED", "GENERAL_CHAT"
    else:
        phase, outcome = "COMPLETED", state.get("outcome", "SUCCEEDED")
    envelope = {
        "phase": phase, "outcome": outcome, "missing_information": missing,
        "error_code": error_code, "actions": [], "authoritative_cards": [],
    }
    response = "Mình đã cập nhật thông tin theo kết quả xác thực."
    if phase == "NEEDS_INFO":
        response = "Mình cần thêm thông tin cần thiết để tiếp tục xử lý yêu cầu của bạn."
    elif phase == "IN_PROGRESS":
        response = "Mình đang kiểm tra lựa chọn phù hợp dựa trên dữ liệu hiện có."
    elif phase == "FAILED":
        response = "Yêu cầu chưa thể hoàn tất an toàn với thông tin hiện tại."
    return {"response": response, "grounding_envelope": envelope, "tool_request": state.get("tool_request")}
