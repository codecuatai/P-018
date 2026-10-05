from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from src.agents.confirmation import is_explicit_confirmation
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
            if not _is_restaurant_message(query, state.get("intent")):
                return {"intent": "general_chat", "slots": prior, "status": "COMPLETED"}
            legacy_prior = {**prior, "_tool_result": tool_result}
            extracted = _extract_slots(query, legacy_prior, datetime.now(TZ))
            data = tool_result.get("data", tool_result) if isinstance(tool_result, dict) else {}
            items = data.get("items", []) if isinstance(data, dict) else []
            folded = _fold(query)
            selected_index = next(
                (index for index, item in enumerate(items) if _matches_restaurant_name(str(item.get("name", "")), query)),
                None,
            )
            if selected_index is None and items and any(term in folded for term in ("cai thu nhat", "thu nhat", "dau tien", "so 1")):
                selected_index = 0
            if selected_index is None and len(items) > 1 and any(term in folded for term in ("cai thu hai", "thu hai", "so 2")):
                selected_index = 1
            patch = {
                key: value
                for key, value in extracted.items()
                if key in RestaurantSlotPatch.model_fields and value is not None
            }
            resolution = RestaurantResolution(
                intent="restaurant",
                slot_patch=patch,
                explicit_confirmation=is_explicit_confirmation(query),
                selected_index=selected_index,
            )
        else:
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


# Restored compatibility helpers retained by the Agent test and fallback APIs.
class RestaurantExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intent: Literal["ride", "food", "restaurant", "healthcare", "general_support"]
    slot_patch: RestaurantSlotPatch = Field(default_factory=RestaurantSlotPatch)
    confidence: float = Field(default=0.0, ge=0, le=1)

def _fold(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value.lower())
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn").replace("đ", "d")

def _parse_time(query: str) -> str | None:
    folded = _fold(query)
    match = re.search(r"\b(\d{1,2})\s*h\s*(\d{2})?\s*(sang|toi|am|pm)?\b", folded)
    if not match:
        match = re.search(r"\b(\d{1,2}):(\d{2})\s*(sang|toi|am|pm)?\b", folded)
    if not match:
        match = re.search(r"\b(\d{1,2})\s+gio\s*(\d{2})?\s*(sang|toi|am|pm)?\b", folded)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    meridiem = match.group(3) if len(match.groups()) >= 3 else None
    if meridiem in {"toi", "pm"} and hour < 12:
        hour += 12
    if meridiem in {"sang", "am"} and hour == 12:
        hour = 0
    if hour > 23 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"

def _parse_date(query: str, now: datetime) -> str | None:
    folded = _fold(query)
    explicit = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b", folded)
    if explicit:
        year = int(explicit.group(3) or now.year)
        return f"{year:04d}-{int(explicit.group(2)):02d}-{int(explicit.group(1)):02d}"
    if "hom nay" in folded:
        return now.date().isoformat()
    if "ngay mai" in folded:
        return (now + timedelta(days=1)).date().isoformat()
    return None

def _matches_restaurant_name(name: str, query: str) -> bool:
    folded_name = _fold(name)
    folded_query = _fold(query)
    if folded_name in folded_query:
        return True
    stop_words = {"va", "và", "and", "nha", "hang"}
    name_tokens = {token for token in re.findall(r"[a-z0-9]+", folded_name) if token not in stop_words}
    query_tokens = set(re.findall(r"[a-z0-9]+", folded_query))
    return bool(name_tokens) and name_tokens.issubset(query_tokens)

def _extract_slots(query: str, previous: dict[str, Any], now: datetime) -> dict[str, Any]:
    slots = dict(previous)
    folded = _fold(query)
    party_match = re.search(r"\b(\d+)\s*(?:nguoi|khach)\b", folded)
    if party_match:
        slots["party_size"] = int(party_match.group(1))
    elif "party_size" in previous and re.fullmatch(r"\s*\d+\s*", folded):
        slots["party_size"] = int(folded.strip())

    parsed_time = _parse_time(query)
    if parsed_time and (
        "h" in folded or "gio" in folded or ":" in folded or any(word in folded for word in ("sang", "toi", "am", "pm"))
    ):
        slots["local_time"] = parsed_time

    parsed_date = _parse_date(query, now)
    if parsed_date:
        slots["local_date"] = parsed_date

    locations = {
        "ha noi": "Hà Nội",
        "ho chi minh": "Hồ Chí Minh",
        "sai gon": "Hồ Chí Minh",
        "da nang": "Đà Nẵng",
    }
    for key, value in locations.items():
        if key in folded:
            slots["location"] = value
            break

    tool_result = previous.get("_tool_result")
    if isinstance(tool_result, dict):
        result_data = tool_result.get("data") if isinstance(tool_result.get("data"), dict) else tool_result
        items = result_data.get("items", []) if isinstance(result_data, dict) else []
        if items:
            selected = None
            if any(term in folded for term in ("cai thu nhat", "thu nhat", "dau tien", "so 1")):
                selected = items[0]
            else:
                for item in items:
                    if _matches_restaurant_name(str(item.get("name", "")), query):
                        selected = item
                        break
            if selected:
                slots["restaurant_id"] = selected.get("id")
                slots["restaurant_name"] = selected.get("name")

    duration_match = re.search(r"\b(\d+)\s*phut\b", folded)
    if duration_match:
        slots["duration_minutes"] = int(duration_match.group(1))
    return slots

def _is_restaurant_message(query: str, previous_intent: str | None) -> bool:
    folded = _fold(query)
    if previous_intent == "restaurant_booking":
        return True
    return any(term in folded for term in ("dat ban", "nha hang", "ban an", "ban co the di"))
