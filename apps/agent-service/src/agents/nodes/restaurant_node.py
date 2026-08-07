from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any

from src.agents.policies.tool_policy import validate_tool_request
from src.agents.state import AgentState
from src.models.schemas import ToolRequest


TZ = timezone(timedelta(hours=7))


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


def _extract_slots(query: str, previous: dict[str, Any], now: datetime) -> dict[str, Any]:
    slots = dict(previous)
    folded = _fold(query)
    party_match = re.search(r"\b(\d+)\s*(?:nguoi|khach)\b", folded)
    if party_match:
        slots["party_size"] = int(party_match.group(1))
    elif "party_size" in previous and re.fullmatch(r"\s*\d+\s*", folded):
        slots["party_size"] = int(folded.strip())

    parsed_time = _parse_time(query)
    if parsed_time and ("h" in folded or "gio" in folded or ":" in folded or any(word in folded for word in ("sang", "toi", "am", "pm"))):
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
        items = tool_result.get("data", {}).get("items", []) if isinstance(tool_result.get("data"), dict) else []
        if items:
            selected = None
            if any(term in folded for term in ("cai thu nhat", "thu nhat", "dau tien", "so 1")):
                selected = items[0]
            else:
                for item in items:
                    if _fold(str(item.get("name", ""))) in folded:
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


def _is_confirmation(query: str) -> bool:
    folded = _fold(query).strip()
    return any(term in folded for term in ("co", "dong y", "x ac nhan", "xac nhan", "dat di", "giu ban", "tiep tuc", "ok", "duoc"))


def _tool_result_response(result: dict[str, Any], tool_name: str | None = None) -> str:
    if result.get("error") == "PAST_START":
        return "Khung giờ bạn chọn đã qua. Bạn chọn một giờ khác trong tương lai giúp mình nhé."
    if result.get("error") == "CAPACITY_UNAVAILABLE":
        return "Khung giờ này không còn bàn phù hợp. Bạn muốn thử giờ khác không?"
    if result.get("error"):
        return "Mình chưa lấy được dữ liệu nhà hàng lúc này. Bạn thử lại giúp mình nhé."
    data = result.get("data", result)
    if tool_name == "restaurant.create_hold" and isinstance(data, dict):
        return f"Mình đã giữ bàn trong 10 phút. Bạn xác nhận lần cuối để mình tạo đặt bàn nhé."
    if tool_name == "restaurant.create_reservation" and isinstance(data, dict):
        return f"Đặt bàn thành công. Mã đặt bàn của bạn là {data.get('reservation_code', data.get('id', 'đã tạo'))}."
    if isinstance(data, dict) and "items" in data:
        items = data.get("items", [])
        if not items:
            return "Mình chưa tìm thấy nhà hàng phù hợp ở khu vực đó. Bạn muốn thử khu vực khác không?"
        names = [str(item.get("name", "nhà hàng")) for item in items[:5]]
        return "Mình tìm thấy: " + ", ".join(names) + ". Bạn muốn kiểm tra bàn ở nhà hàng nào?"
    if isinstance(data, dict) and data.get("available") is True:
        return "Khung giờ này đang có bàn phù hợp. Bạn có muốn mình giữ bàn để tiếp tục đặt không?"
    if isinstance(data, dict) and data.get("available") is False:
        return "Khung giờ này hiện không còn bàn phù hợp. Bạn muốn thử giờ khác không?"
    return "Mình đã nhận được kết quả từ nhà hàng. Bạn muốn tiếp tục bước nào?"


async def classify_and_extract(state: AgentState) -> dict[str, Any]:
    query = state.get("query", "")
    previous_intent = state.get("intent")
    context = state.get("context", {})
    if context.get("tool_result"):
        if context.get("tool_result_only"):
            return {"status": "COMPLETED", "response": _tool_result_response(context["tool_result"], context.get("tool_name")), "intent": previous_intent or "restaurant_booking", "slots": context.get("slots", {})}
        context_slots = dict(context.get("slots", {}))
        context_slots["_tool_result"] = context.get("tool_result")
        tool_name = context.get("tool_name")
        slots = _extract_slots(query, context_slots, datetime.now(TZ))
        if tool_name == "restaurant.search" and slots.get("restaurant_id"):
            tool_request = validate_tool_request(ToolRequest(
                tool_name="restaurant.check_availability", risk_level="READ",
                arguments={key: slots[key] for key in ("restaurant_id", "party_size", "start_at", "duration_minutes") if key in slots},
                workflow_id=state["workflow_id"], tool_call_id=f"tc-{state['workflow_id']}-{state.get('turn_id', '1')}",
            ))
            return {"intent": "restaurant_booking", "slots": slots, "tool_request": tool_request.model_dump(), "status": "TOOL_REQUEST_READY"}
        elif tool_name == "restaurant.check_availability" and _is_confirmation(query):
            tool_request = validate_tool_request(ToolRequest(
                tool_name="restaurant.create_hold", risk_level="REVERSIBLE_WRITE",
                arguments={key: slots[key] for key in ("restaurant_id", "party_size", "start_at", "duration_minutes") if key in slots},
                workflow_id=state["workflow_id"], tool_call_id=f"tc-{state['workflow_id']}-{state.get('turn_id', '1')}",
                idempotency_key=f"hold-{state['workflow_id']}-{state.get('turn_id', '1')}",
            ))
            return {"intent": "restaurant_booking", "slots": slots, "tool_request": tool_request.model_dump(), "status": "TOOL_REQUEST_READY"}
        elif tool_name == "restaurant.create_hold" and _is_confirmation(query):
            hold_data = context.get("tool_result", {}).get("data", {})
            tool_request = validate_tool_request(ToolRequest(
                tool_name="restaurant.create_reservation", risk_level="FINANCIAL_OR_FINAL",
                arguments={"restaurant_id": slots.get("restaurant_id"), "party_size": slots.get("party_size"), "start_at": slots.get("start_at"), "duration_minutes": slots.get("duration_minutes", 120), "hold_id": hold_data.get("id")},
                workflow_id=state["workflow_id"], tool_call_id=f"tc-{state['workflow_id']}-{state.get('turn_id', '1')}",
                idempotency_key=f"reservation-{state['workflow_id']}-{state.get('turn_id', '1')}",
            ))
            return {"intent": "restaurant_booking", "slots": slots, "tool_request": tool_request.model_dump(), "status": "TOOL_REQUEST_READY"}
        return {"status": "COMPLETED", "response": _tool_result_response(context["tool_result"], tool_name), "intent": previous_intent or "restaurant_booking", "slots": context.get("slots", {})}

    folded = _fold(query)
    if any(term in folded for term in ("suc khoe", "bac si", "kham benh", "y te")):
        return {"intent": "healthcare_request", "status": "COMPLETED", "slots": {}, "unsupported": True}
    if not _is_restaurant_message(query, previous_intent):
        return {"intent": "general_chat", "slots": {}, "status": "COMPLETED"}

    now = datetime.now(TZ)
    slots = _extract_slots(query, context.get("slots", state.get("slots", {})), now)
    try:
        from src.config import get_settings
        if get_settings().agent_model_mode == "gemini":
            from src.model.gemini_adapter import GeminiAdapter
            model_result = await GeminiAdapter().extract(query, context)
            if model_result.get("intent") in {"healthcare_request", "general_chat"}:
                return {"intent": model_result["intent"], "slots": slots, "status": "COMPLETED", "unsupported": model_result["intent"] == "healthcare_request"}
            slots.update({key: value for key, value in model_result.get("slot_patch", {}).items() if value not in (None, "")})
    except Exception:
        # Deterministic extraction remains a safe availability-only fallback.
        pass
    if slots.get("local_date") and slots.get("local_time"):
        slots["start_at"] = f"{slots['local_date']}T{slots['local_time']}:00+07:00"

    missing = [name for name in ("party_size", "local_date", "local_time", "location") if name not in slots]
    if missing:
        return {"intent": "restaurant_booking", "slots": slots, "missing_slots": missing, "status": "NEEDS_INPUT"}

    if slots.get("restaurant_id"):
        tool_name = "restaurant.check_availability"
        arguments = {key: slots[key] for key in ("restaurant_id", "party_size", "start_at", "duration_minutes") if key in slots}
    else:
        tool_name = "restaurant.search"
        arguments = {key: slots[key] for key in ("location", "party_size", "start_at", "duration_minutes") if key in slots}
        arguments.setdefault("limit", 10)
    tool_request = validate_tool_request(ToolRequest(
        tool_name=tool_name,
        risk_level="READ",
        arguments=arguments,
        workflow_id=state["workflow_id"],
        tool_call_id=f"tc-{state['workflow_id']}-{state.get('turn_id', '1')}",
    ))
    return {"intent": "restaurant_booking", "slots": slots, "missing_slots": [], "tool_request": tool_request.model_dump(), "status": "TOOL_REQUEST_READY"}


def compose_restaurant_response(state: AgentState) -> dict[str, Any]:
    if state.get("unsupported"):
        return {"response": "Hiện tại mình chưa hỗ trợ đặt lịch kiểm tra sức khỏe. Mình có thể hỗ trợ tìm nhà hàng và đặt bàn."}
    if state.get("status") == "NEEDS_INPUT":
        labels = {"party_size": "số người", "local_date": "ngày", "local_time": "giờ", "location": "khu vực hoặc thành phố"}
        first_missing = state.get("missing_slots", ["thông tin cần thiết"])[0]
        return {"response": f"Bạn cho mình biết {labels.get(first_missing, first_missing)} nhé."}
    if state.get("status") == "TOOL_REQUEST_READY":
        return {"response": "Mình sẽ tìm nhà hàng và kiểm tra lựa chọn phù hợp cho bạn.", "tool_request": state.get("tool_request")}
    if state.get("intent") == "general_chat":
        return {"response": "Mình là trợ lý đặt bàn nhà hàng. Bạn có thể nói ví dụ: ‘Đặt bàn cho 2 người ngày mai lúc 19h ở Hà Nội’."}
    return {"response": state.get("response", "Mình đã xử lý yêu cầu của bạn.")}
