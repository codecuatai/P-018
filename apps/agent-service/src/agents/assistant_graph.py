from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta
from typing import Any, Literal, TypedDict
from zoneinfo import ZoneInfo

from langgraph.graph import END, StateGraph
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..config import get_settings
from ..services.llm import GeminiAdapter, LLMAdapter, llm_diagnostics

logger = logging.getLogger(__name__)

SUPPORTED_DOMAINS = ("ride", "food", "restaurant", "healthcare")
FORBIDDEN_MODEL_FIELDS = {
    "id",
    "*_id",
    "reservation_id",
    "appointment_id",
    "booking_id",
    "confirmation_id",
    "price",
    "amount",
    "currency",
    "availability",
    "available",
    "payment_status",
    "payment_result",
    "status",
    "provider_reference",
    "resource_version",
    "snapshot_hash",
    "quote_version",
    "cart_version",
    "reservation_code",
}
TIMEZONE = "Asia/Bangkok"

XONE_SYSTEM_PROMPT = """You are X-One, a Vietnamese conversational service assistant.

Understand one user message as one or more supported service tasks:
- ride booking
- food delivery
- dine-in restaurant reservation
- healthcare appointment booking

Identify every supported request, separate tasks, preserve useful context across
turns, and mark dependencies. A restaurant destination must come from a later
authoritative restaurant result; never guess an address. Ask only for information
that is actually missing and prefer one short clarification question.

The planner may return semantic language and user-provided preferences only. It
must never create database IDs, reservation IDs, appointment IDs, booking IDs,
prices, availability, confirmation IDs, payment results, or final success.
Those values can only come from the Gateway and its authoritative services.

Final bookings, payments, cancellations, and refunds always require an explicit
confirmation enforced by the backend. Never expose implementation terminology to
the user. Respond naturally in Vietnamese unless the user uses another language.

Distinguish “đặt bàn / ăn tại nhà hàng” from “đặt món / giao đồ ăn / ship đồ ăn”.
“Đặt xe / đi từ A đến B” is a ride request. “Khám / bác sĩ / lịch khám / triệu
chứng” is healthcare assistance, not diagnosis. Unsupported travel or lodging
requests should be answered politely without inventing a capability.
"""


class PlannedTask(BaseModel):
    model_config = ConfigDict(extra="forbid")

    domain: Literal["ride", "food", "restaurant", "healthcare"]
    goal: str = Field(min_length=1, max_length=500)
    normalized_request: str = Field(min_length=1, max_length=2000)
    extracted_slots: dict[str, Any] = Field(default_factory=dict)
    depends_on: list[int] = Field(default_factory=list, max_length=4)
    needs_clarification: bool = False
    missing_information: list[str] = Field(default_factory=list, max_length=8)


class AssistantPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assistant_message: str = Field(default="Mình sẽ giúp bạn xử lý yêu cầu này.", max_length=1000)
    tasks: list[PlannedTask] = Field(default_factory=list, max_length=4)
    needs_clarification: bool = False
    clarification_question: str | None = Field(default=None, max_length=500)


class AssistantComposition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=1200)


class AssistantState(TypedDict, total=False):
    query: str
    conversation_id: str
    messages: list[dict[str, str]]
    conversation_state: dict[str, Any]
    authoritative_results: list[dict[str, Any]]
    mode: Literal["plan", "compose"]
    plan: dict[str, Any]
    assistant_message: str
    decision_source: str
    model: str
    fallback_model: str
    error: str


MODEL_DIAGNOSTICS: dict[str, Any] = {
    "last_model_call_at": None,
    "last_model_call_status": "not_called",
    "last_model_call_error": None,
}


def model_diagnostics() -> dict[str, Any]:
    """Return safe internal model diagnostics; never include provider secrets."""
    settings = get_settings()
    runtime = llm_diagnostics(settings)
    return {
        "model_mode": settings.agent_model_mode,
        "model": settings.gemini_model,
        "fallback_model": settings.gemini_fallback_model,
        "configured_primary": runtime["configured_primary"],
        "configured_fallback": runtime["configured_fallback"],
        "last_model_used": runtime["last_model_used"],
        "fallback_used": runtime["fallback_used"],
        "fallback_model_attempted": runtime["fallback_model_attempted"],
        "structured_output_fallback_used": runtime["structured_output_fallback_used"],
        "api_key_configured": bool(settings.gemini_api_key),
        "last_model_call_at": runtime["last_model_call_at"],
        "last_model_call_status": runtime["last_model_call_status"],
        "last_model_call_error_type": runtime["last_model_call_error"],
        "last_model_call_http_status": runtime["last_model_call_http_status"],
        "last_model_call_category": runtime["last_model_call_category"],
        "last_model_call_invocation": runtime["last_model_call_invocation"],
    }


def _now() -> datetime:
    return datetime.now(ZoneInfo(TIMEZONE))


def _plain(value: str) -> str:
    import unicodedata

    normalized = unicodedata.normalize("NFD", value.casefold())
    return "".join("d" if char == "đ" else char for char in normalized if unicodedata.category(char) != "Mn")


def _has_any(text: str, values: tuple[str, ...]) -> bool:
    return any(value in text for value in values)


def _is_direct_healthcare_request(text: str) -> bool:
    lowered = _plain(text)
    healthcare = _has_any(lowered, ("dat lich kham", "lich kham", "bac si", "kham", "chuyen khoa", "khoa", "dau dau", "trieu chung"))
    other_service = _has_any(lowered, ("goi xe", "dat xe", "nha hang", "dat ban", "dat mon", "giao do an", "ship do an"))
    return healthcare and not other_service


def _number(text: str, words: tuple[tuple[str, int], ...] = ()) -> int | None:
    match = re.search(r"\b([1-9][0-9]?)\b", text)
    if match:
        return int(match.group(1))
    for word, value in words:
        if re.search(rf"\b{word}\b", text):
            return value
    return None


def _location(text: str) -> str | None:
    match = re.search(r"\b(?:ở|tại|tai|o|khu vuc)\b\s+([^,.!?;]+)", text, flags=re.IGNORECASE)
    if not match:
        return None
    result = match.group(1).strip()
    result = re.split(
        r"\b(?:roi|sau do|va|rồi|sau đó|và|lúc|luc|vào|vao|ngày|ngay|tối|toi|sáng|sang|trưa|trua)\b",
        result,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    return result.strip() or None


def _route(text: str) -> tuple[str | None, str | None]:
    reference = re.search(
        r"(?:từ|tu|from)\s+(.+?)\s+(?:đưa tôi|dua toi|take me)\s+(?:tới đó|toi do|đến đó|den do|there)",
        text,
        flags=re.IGNORECASE,
    )
    if reference:
        return reference.group(1).strip() or None, None

    match = re.search(r"(?:từ|tu|from)\s+(.+?)\s+(?:đến|den|tới|toi|to)\s+(.+?)(?:[,.!?]|$)", text, flags=re.IGNORECASE)
    if match:
        pickup = match.group(1).strip()
        dropoff = match.group(2).strip()
        dropoff = re.split(r"\b(?:rồi|sau đó|và|sau khi)\b", dropoff, maxsplit=1, flags=re.IGNORECASE)[0].strip()
        dropoff = _strip_vehicle_suffix(dropoff)
        return pickup or None, dropoff or None

    # "từ VinUni đưa tôi tới đó" intentionally carries only a pickup.  The
    # dependent domain must provide the destination; the planner must not
    # turn the reference "đó" into an invented address.
    return None, None


def _strip_vehicle_suffix(value: str) -> str:
    return re.sub(
        r"\s+(?:bằng|bang|với|voi)\s+(?:xe\s*)?(?:máy|may|[47]\s*(?:chỗ|cho)|bike|car[_ ]?[47])\s*$",
        "",
        value,
        flags=re.IGNORECASE,
    ).strip()


def _clean_changed_route_value(value: str) -> str | None:
    value = re.sub(r"^(?:qua|sang|thành|thanh|là|la|tới|toi)\s+", "", value, flags=re.IGNORECASE)
    value = re.sub(
        r"\s+(?:và\s+)?(?:đổi|doi|thay|chuyển|chuyen)?\s*"
        r"(?:phương tiện|phuong tien|loại xe|loai xe).*$",
        "",
        value,
        flags=re.IGNORECASE,
    )
    value = re.sub(
        r"\s*(?:giúp\s+(?:tôi|mình)|giup\s+(?:toi|minh)|nhé|nhe|thôi|thoi)\s*$",
        "",
        value,
        flags=re.IGNORECASE,
    )
    value = _strip_vehicle_suffix(value).strip(" ,;")
    return value or None


def _changed_route_slots(text: str) -> dict[str, str]:
    """Extract explicit ride-field edits without letting one field consume another."""

    change = r"(?:đổi|doi|thay|chuyển|chuyen)"
    pickup_label = r"(?:điểm đón|diem don|đón|don|pickup|điểm xuất phát|diem xuat phat)"
    dropoff_label = r"(?:điểm đến|diem den|đến|den|destination)"
    change_value = r"(?:qua|sang|thành|thanh|là|la|tới|toi)"
    value_end = (
        r"(?=\s*(?:[,;.!?]|$)|\s+(?:và\s+)?(?:đổi|doi|thay|chuyển|chuyen)\s*"
        r"(?:phương tiện|phuong tien|loại xe|loai xe)\b)"
    )

    for candidate in (text, _plain(text)):
        slots: dict[str, str] = {}

        # Parse the two endpoints together for instructions such as
        # "đổi điểm đón ... và điểm đến ...". This keeps the connector out of
        # the pickup address and makes both fields authoritative replacements.
        pair = re.search(
            rf"\b{change}\s+{pickup_label}\s*(?:{change_value}\s+)?"
            rf"(?P<pickup>.+?)\s+và\s+(?:{change}\s+)?{dropoff_label}\s*"
            rf"(?:{change_value}\s+)?(?P<dropoff>.+?){value_end}",
            candidate,
            re.IGNORECASE,
        )
        if pair:
            pickup = _clean_changed_route_value(pair.group("pickup"))
            dropoff = _clean_changed_route_value(pair.group("dropoff"))
            if pickup:
                slots["pickup_address"] = pickup
            if dropoff:
                slots["dropoff_address"] = dropoff
            if slots:
                return slots

        pickup = re.search(
            rf"\b{change}\s+{pickup_label}\s*(?:{change_value}\s+)?(?P<value>.+?)"
            rf"(?=\s+(?:và\s+)?(?:{change}\s+)?{dropoff_label}\b|{value_end})",
            candidate,
            re.IGNORECASE,
        )
        if pickup:
            value = _clean_changed_route_value(pickup.group("value"))
            if value:
                slots["pickup_address"] = value

        dropoff = re.search(
            rf"\b{change}\s+{dropoff_label}\s*(?:{change_value}\s+)?(?P<value>.+?){value_end}",
            candidate,
            re.IGNORECASE,
        )
        if dropoff:
            value = _clean_changed_route_value(dropoff.group("value"))
            if value:
                slots["dropoff_address"] = value

        if slots:
            return slots

    return {}


def _changed_route_slot(text: str, slot: str) -> str | None:
    return _changed_route_slots(text).get(slot)


def _has_explicit_clock(text: str) -> bool:
    lowered = _plain(text)
    return bool(re.search(r"\b\d{1,2}(?:\s*(?:gio|h)|:[0-5]\d)\b", lowered))


def _time_slot(text: str, now: datetime | None = None) -> str | None:
    current = now or _now()
    lowered = _plain(text)
    explicit_date: datetime.date | None = None
    date_match = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b", lowered)
    if date_match:
        day, month, year = (int(value) for value in date_match.groups())
        if year < 100:
            year += 2000
        try:
            explicit_date = datetime(year, month, day, tzinfo=current.tzinfo).date()
        except ValueError:
            return None
    hour_match = re.search(r"\b(\d{1,2})(?:\s*(?:gio|h)|:([0-5]\d))\s*(sang|toi|trua|am|pm)?", lowered)
    hour: int | None = None
    minute = 0
    if hour_match:
        hour = int(hour_match.group(1))
        minute = int(hour_match.group(2) or 0)
        period = hour_match.group(3)
        if period in {"toi", "pm"} and hour < 12:
            hour += 12
        if period == "trua" and hour < 11:
            hour += 12
    elif "sang mai" in lowered:
        hour = 8
    elif "toi nay" in lowered:
        hour = 19
    elif "trua nay" in lowered:
        hour = 12
    if hour is None or hour > 23:
        return None
    day = explicit_date or current.date()
    if explicit_date is None and "ngay kia" in lowered:
        day += timedelta(days=2)
    elif explicit_date is None and ("mai" in lowered or "ngay mai" in lowered):
        day += timedelta(days=1)
    candidate = datetime(day.year, day.month, day.day, hour, minute, tzinfo=current.tzinfo)
    if explicit_date is None and candidate <= current and "mai" not in lowered:
        candidate += timedelta(days=1)
    return candidate.isoformat()


def _healthcare_requested_date(text: str, now: datetime | None = None) -> str | None:
    """Return an explicit calendar day without inventing an appointment hour."""
    current = now or _now()
    lowered = _plain(text)
    date_match = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b", lowered)
    if date_match:
        day, month, year = (int(value) for value in date_match.groups())
        if year < 100:
            year += 2000
        try:
            return datetime(year, month, day, tzinfo=current.tzinfo).date().isoformat()
        except ValueError:
            return None
    if "ngay kia" in lowered:
        return (current.date() + timedelta(days=2)).isoformat()
    if "ngay mai" in lowered or "mai" in lowered:
        return (current.date() + timedelta(days=1)).isoformat()
    if "hom nay" in lowered:
        return current.date().isoformat()
    return None


def _semantic_slots(text: str, domain: str) -> dict[str, Any]:
    lowered = _plain(text)
    slots: dict[str, Any] = {}
    party_size = _number(lowered, (("mot", 1), ("hai", 2), ("ba", 3), ("bon", 4), ("nam", 5)))
    if domain == "restaurant" and party_size is not None and _has_any(lowered, ("nguoi", "khach", "ban")):
        slots["party_size"] = party_size
    if domain == "ride":
        pickup, dropoff = _route(text)
        changed_slots = _changed_route_slots(text)
        pickup = changed_slots.get("pickup_address") or pickup
        dropoff = changed_slots.get("dropoff_address") or dropoff
        if pickup:
            slots["pickup_address"] = pickup
        if dropoff:
            slots["dropoff_address"] = dropoff
        if "4 cho" in lowered or "bon cho" in lowered:
            slots["vehicle_type"] = "CAR_4"
        elif "7 cho" in lowered or "bay cho" in lowered:
            slots["vehicle_type"] = "CAR_7"
        elif "xe may" in lowered:
            slots["vehicle_type"] = "BIKE"
    if domain in {"restaurant", "healthcare"}:
        location = _location(text)
        if location:
            slots["location"] = location
        # A healthcare daypart such as "sáng mai" is a range preference, not
        # an exact 08:00 request.  Exact clock times are kept as start_at.
        if domain == "restaurant" or _has_explicit_clock(text):
            start_at = _time_slot(text)
            if start_at:
                slots["start_at"] = start_at
        if domain == "restaurant":
            cuisine_match = re.search(r"(?:muon an|thich an|an)\s+([^,.!?]+)", lowered, flags=re.IGNORECASE)
            if cuisine_match:
                cuisine = re.split(r"\b(?:luc|vao|toi|sang|trua)\b", cuisine_match.group(1), maxsplit=1)[0].strip()
                if cuisine and cuisine not in {"tai nha hang", "nha hang"}:
                    slots["cuisine_query"] = cuisine
    if domain == "food":
        if "giao ve nha" in lowered or "giao toi nha" in lowered or "ship" in lowered:
            slots["delivery_preference"] = "home"
        dish_match = re.search(r"(?:pho|bún|bun|com|burger|pizza|do an|mon)\s+[^,.;!?]+", lowered)
        if dish_match:
            dish_query = re.split(
                r"\b(?:giao\s+(?:ve|toi)|ship|(?:va|roi)\s+(?:dat|goi)|dat\s+lich|goi\s+xe)\b",
                dish_match.group(0),
                maxsplit=1,
            )[0].strip()
            if dish_query:
                slots["dish_query"] = dish_query
        location = _location(text)
        if location:
            slots["location"] = location
    if domain == "healthcare":
        appointment_date = _healthcare_requested_date(text)
        if appointment_date:
            slots["appointment_date"] = appointment_date
        for department in ("than kinh", "tieu hoa", "tim mach", "noi tiet", "da lieu", "nhi khoa"):
            if department in lowered:
                slots["department"] = department
                break
        if "sang mai" in lowered:
            slots["time_preference"] = "tomorrow_morning"
        elif "chieu mai" in lowered:
            slots["time_preference"] = "tomorrow_afternoon"
        elif "toi mai" in lowered:
            slots["time_preference"] = "tomorrow_evening"
        elif "sang ngay kia" in lowered or "buoi sang" in lowered:
            slots["time_preference"] = "morning"
        elif "chieu ngay kia" in lowered or "buoi chieu" in lowered:
            slots["time_preference"] = "afternoon"
        elif "toi ngay kia" in lowered or "buoi toi" in lowered or "toi nay" in lowered:
            slots["time_preference"] = "evening"
        if _has_any(lowered, ("dau", "met", "trieu chung", "symptom")):
            slots["symptoms"] = text[:500]
    if "chon cai dau tien" in lowered or "chon quan dau tien" in lowered or "chon nha hang dau tien" in lowered or "mon so mot" in lowered:
        slots["selection"] = "first"
    elif "chon cai thu hai" in lowered or "chon quan thu hai" in lowered or "mon so hai" in lowered:
        slots["selection"] = "second"
    elif "chon cai thu ba" in lowered or "chon quan thu ba" in lowered or "mon so ba" in lowered:
        slots["selection"] = "third"
    elif "chon cai thu tu" in lowered or "chon quan thu tu" in lowered or "mon so bon" in lowered:
        slots["selection"] = "fourth"
    elif "chon cai thu nam" in lowered or "chon quan thu nam" in lowered or "mon so nam" in lowered:
        slots["selection"] = "fifth"
    else:
        ordinal = re.search(r"\b(?:chon|lay)\s+(?:cai|mon|quan)?\s*(?:so|thu)\s*([1-9][0-9]?)\b", lowered)
        if ordinal:
            slots["selection_index"] = int(ordinal.group(1)) - 1
    return slots


def _task(domain: str, text: str, goal: str, slots: dict[str, Any], depends_on: list[int] | None = None) -> PlannedTask:
    missing: list[str] = []
    if domain == "restaurant":
        for key in ("location",):
            if not slots.get(key):
                missing.append(key)
    if domain == "ride":
        for key in ("pickup_address",):
            if not slots.get(key):
                missing.append(key)
        # A dependent ride may receive its destination from an authoritative
        # Healthcare or Restaurant result after the prerequisite is held/selected.
        if not slots.get("dropoff_address") and not depends_on:
            missing.append("dropoff_address")
    return PlannedTask(
        domain=domain, goal=goal, normalized_request=text[:2000], extracted_slots=slots,
        depends_on=depends_on or [], needs_clarification=bool(missing), missing_information=missing,
    )


def _pending_action_kinds(task: dict[str, Any]) -> set[str]:
    values = task.get("pending_actions", [])
    if not isinstance(values, list):
        return set()
    return {str(value) for value in values if isinstance(value, str)}


def _follow_up_targets(message: str, previous_tasks: list[Any]) -> list[int]:
    """Resolve a follow-up to at most one existing semantic task.

    The planner receives only a safe task projection.  It must not replay every
    old task just because the user supplied a short phrase such as "chọn cái
    đầu tiên".  Domain wording wins; otherwise pending action kinds and the
    number of active candidates decide whether a clarification is required.
    """
    lowered = _plain(message)
    active: list[tuple[int, dict[str, Any]]] = []
    for index, value in enumerate(previous_tasks):
        if not isinstance(value, dict):
            continue
        if str(value.get("domain", "")) not in SUPPORTED_DOMAINS:
            continue
        if str(value.get("phase", "")) == "COMPLETED":
            continue
        active.append((index, value))
    if not active:
        return []

    food_words = (
        "chon quan", "chon mon", "pho", "bun", "com", "bat", "co lon",
        "khong cay", "giao ve", "giao toi", "ship", "dia chi", "ap ma",
        "tong tien", "xem tong", "dat luon",
    )
    healthcare_words = ("lich kham", "bac si", "kham", "than kinh", "chon lich", "trieu chung")
    restaurant_words = ("dat ban", "nha hang", "chon nha hang", "so nguoi")
    ride_words = (
        "dat xe", "goi xe", "di tu", "xe may", "xe 4 cho", "xe 7 cho",
        "doi phuong tien", "thay phuong tien", "loai xe",
    )

    matches: list[int] = []
    if _has_any(lowered, food_words):
        matches = [index for index, task in active if task.get("domain") == "food"]
    elif _has_any(lowered, healthcare_words):
        matches = [index for index, task in active if task.get("domain") == "healthcare"]
    elif _has_any(lowered, restaurant_words):
        matches = [index for index, task in active if task.get("domain") == "restaurant"]
    elif _has_any(lowered, ride_words):
        matches = [index for index, task in active if task.get("domain") == "ride"]
    elif _has_any(lowered, ("chon cai", "chon thu", "chon cai dau tien", "chon cai thu hai")):
        for index, task in active:
            pending = _pending_action_kinds(task)
            domain = str(task.get("domain"))
            if (
                (domain == "restaurant" and "select_restaurant" in pending)
                or (domain == "healthcare" and "select_healthcare_slot" in pending)
                or (domain == "food" and pending.intersection({"food_confirm", "select_food"}))
            ):
                matches.append(index)
        if not matches:
            matches = [index for index, _ in active]
    else:
        for index, task in active:
            domain = str(task.get("domain"))
            semantic = _semantic_slots(message, domain)
            if semantic or (domain == "restaurant" and _has_any(lowered, ("hoan kiem", "ha noi", "cau giay", "tay ho", "ba dinh"))):
                matches.append(index)

    if not matches and len(active) == 1:
        matches = [active[0][0]]
    return sorted(set(matches))


def deterministic_plan(message: str, conversation_state: dict[str, Any] | None = None) -> AssistantPlan:
    """Conservative offline fallback used only when the provider is unavailable."""
    text = message.strip()
    lowered = _plain(text)
    previous = conversation_state or {}
    previous_tasks = previous.get("tasks", []) if isinstance(previous.get("tasks", []), list) else []
    unsupported = _has_any(lowered, ("may bay", "chuyen bay", "flight", "khach san", "hotel", "tau hoa", "train"))
    if unsupported:
        return AssistantPlan(
            assistant_message="Mình chưa hỗ trợ đặt vé máy bay, phòng khách sạn hoặc vé tàu trong các dịch vụ hiện có.",
            tasks=[],
        )

    follow_up = _has_any(lowered, (
        "chon cai", "chon quan", "chon mon", "nguoi", "hoan kiem", "dong y",
        "doi diem den", "doi diem don", "thay diem den", "thay diem don", "chuyen diem den",
        "doi phuong tien", "thay phuong tien", "loai xe", "xe may",
        "xac nhan", "xe 4 cho", "xe 7 cho", "sang mai", "toi nay", "ngay mai", "ngay kia", "gio",
        "co lon", "khong cay", "giao ve", "ap ma", "tong tien", "dat luon",
    ))
    explicit_restaurant = _has_any(lowered, ("dat ban", "nha hang", "an tai nha hang", "an toi")) and not _has_any(lowered, ("giao ve", "ship", "dat mon"))
    explicit_food = _has_any(lowered, ("giao ve", "giao toi", "ship", "dat mon", "pho", "bun", "com", "do an")) and not (explicit_restaurant and "giao" not in lowered)
    explicit_healthcare = _has_any(lowered, ("dat lich kham", "lich kham", "bac si", "kham", "than kinh", "dau dau", "trieu chung"))
    explicit_ride = _has_any(lowered, ("dat xe", "goi xe", "di tu", "tu ")) and (_route(text)[0] is not None or "xe" in lowered)

    tasks: list[PlannedTask] = []
    if explicit_restaurant:
        tasks.append(_task("restaurant", text, "Tìm và đặt bàn tại nhà hàng phù hợp", _semantic_slots(text, "restaurant")))
    if explicit_food:
        tasks.append(_task("food", text, "Tìm món và chuẩn bị đơn giao tận nơi", _semantic_slots(text, "food")))
    if explicit_healthcare:
        tasks.append(_task("healthcare", text, "Tìm khoa, bác sĩ và lịch khám phù hợp", _semantic_slots(text, "healthcare")))
    if explicit_ride:
        ride_slots = _semantic_slots(text, "ride")
        dropoff = str(ride_slots.get("dropoff_address", ""))
        placeholder_destination = _plain(dropoff).strip() in {"do", "toi do", "den do", "nha hang do"}
        references_prior_destination = (not dropoff or placeholder_destination) and _has_any(
            lowered,
            ("nha hang do", "toi do", "dua toi toi do", "sau do", "roi dat xe", "sau do dat xe"),
        )
        dependencies = [
            index
            for index, item in enumerate(tasks)
            if item.domain in {"restaurant", "healthcare"} and references_prior_destination
        ]
        tasks.append(_task("ride", text, "Tìm chuyến xe phù hợp", ride_slots, dependencies))

    if not tasks and follow_up and previous_tasks:
        targets = _follow_up_targets(text, previous_tasks)
        if len(targets) > 1:
            question = "Bạn muốn tiếp tục với yêu cầu nào: món ăn, đặt bàn hay lịch khám?"
            return AssistantPlan(assistant_message=question, tasks=[], needs_clarification=True, clarification_question=question)
        if targets:
            item = previous_tasks[targets[0]]
            if isinstance(item, dict):
                domain = str(item.get("domain", ""))
                if domain in SUPPORTED_DOMAINS:
                    slots = dict(item.get("extracted_slots", {})) if isinstance(item.get("extracted_slots"), dict) else {}
                    explicit_slots = _semantic_slots(text, domain)
                    # A new day without a clock supersedes an old exact clock.
                    # Keeping it would incorrectly constrain the new day to the
                    # prior appointment time.
                    if domain == "healthcare" and "appointment_date" in explicit_slots and "start_at" not in explicit_slots:
                        slots.pop("start_at", None)
                    slots.update(explicit_slots)
                    if domain == "restaurant" and not slots.get("location") and _has_any(lowered, ("hoan kiem", "ha noi", "cau giay", "tay ho", "ba dinh")):
                        slots["location"] = text
                    if domain == "restaurant":
                        party_size = _number(lowered, (("mot", 1), ("hai", 2), ("ba", 3), ("bon", 4)))
                        if party_size is not None and _has_any(lowered, ("nguoi", "khach", "ban")):
                            slots["party_size"] = party_size
                    tasks.append(_task(domain, str(item.get("normalized_request", text)), str(item.get("goal", "Tiếp tục yêu cầu")), slots))

    if not tasks:
        return AssistantPlan(assistant_message="Mình có thể giúp bạn đặt xe, tìm đồ ăn, đặt bàn hoặc tìm lịch khám. Bạn muốn bắt đầu từ việc nào?")
    if len(tasks) == 1 and tasks[0].needs_clarification:
        missing = tasks[0].missing_information
        labels = {"location": "khu vực", "party_size": "số người", "start_at": "thời gian", "pickup_address": "điểm đón", "dropoff_address": "điểm đến"}
        question = "Bạn cho mình biết thêm " + " và ".join(labels.get(value, value) for value in missing[:2]) + " nhé?"
        return AssistantPlan(assistant_message=question, tasks=tasks, needs_clarification=True, clarification_question=question)
    return AssistantPlan(assistant_message=f"Mình sẽ giúp bạn xử lý {len(tasks)} việc trong cùng cuộc trò chuyện.", tasks=tasks)


def _safe_slots(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    safe: dict[str, Any] = {}
    for key, item in value.items():
        normalized = str(key).casefold()
        if normalized.endswith("_id") or normalized in FORBIDDEN_MODEL_FIELDS or normalized in {"price", "amount", "currency", "availability", "available", "status"}:
            continue
        if isinstance(item, str | int | float | bool) or item is None:
            safe[str(key)] = item
        elif isinstance(item, list) and len(item) <= 8 and all(isinstance(entry, str | int | float | bool) for entry in item):
            safe[str(key)] = item
    return safe


def _safe_model_text(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()[:limit]
    if re.search(r"(?:confirmation|workflow|tool[_ -]?call|reservation|appointment|booking|order)[_: -][a-z0-9-]+", text, flags=re.IGNORECASE):
        return ""
    return text


def _planner_safe_state(value: Any) -> dict[str, Any]:
    """Project stored Gateway state to semantic routing context only."""
    if not isinstance(value, dict):
        return {}
    raw_tasks = value.get("tasks", [])
    if not isinstance(raw_tasks, list):
        return {}
    tasks: list[dict[str, Any]] = []
    for index, raw_task in enumerate(raw_tasks[:8]):
        if not isinstance(raw_task, dict):
            continue
        domain = str(raw_task.get("domain", ""))
        if domain not in SUPPORTED_DOMAINS:
            continue
        safe_task: dict[str, Any] = {
            "task_ref": index,
            "domain": domain,
            "goal": _safe_model_text(raw_task.get("goal"), 500),
            "phase": str(raw_task.get("phase", "PLANNING")),
            "extracted_slots": _domain_slots(domain, _canonical_model_slots(raw_task.get("extracted_slots"))),
        }
        dependencies = raw_task.get("depends_on", [])
        if isinstance(dependencies, list):
            safe_task["depends_on"] = [item for item in dependencies if isinstance(item, int) and 0 <= item < 8]
        pending_actions = raw_task.get("pending_actions", [])
        if isinstance(pending_actions, list):
            safe_actions = [str(item) for item in pending_actions if str(item) in {
                "select_restaurant", "restaurant_confirm", "ride_service", "ride_payment",
                "select_healthcare_slot", "healthcare_payment", "healthcare_confirm", "select_food_item", "food_confirm", "food_payment",
            }]
            if safe_actions:
                safe_task["pending_actions"] = safe_actions
        pending_choice = raw_task.get("pending_choice")
        if isinstance(pending_choice, dict):
            kind = pending_choice.get("kind")
            count = pending_choice.get("count")
            if isinstance(kind, str) and isinstance(count, int) and 0 <= count <= 20:
                safe_task["pending_choice"] = {"kind": kind[:80], "count": count}
        tasks.append(safe_task)
    return {"tasks": tasks}


def _safe_model_value(value: Any, depth: int = 0) -> Any:
    if depth > 4:
        return None
    if isinstance(value, dict):
        result: dict[str, Any] = {}
        for key, item in value.items():
            normalized = str(key).casefold()
            if normalized.endswith("_id") or normalized in FORBIDDEN_MODEL_FIELDS or normalized in {
                "workflow_id", "tool_call_id", "provider_reference", "resource_version",
            }:
                continue
            safe = _safe_model_value(item, depth + 1)
            if safe is not None:
                result[str(key)] = safe
        return result
    if isinstance(value, list):
        return [_safe_model_value(item, depth + 1) for item in value[:8]]
    if isinstance(value, str | int | float | bool) or value is None:
        return value
    return None


MODEL_SLOT_ALIASES: dict[str, str] = {
    "pickup_location": "pickup_address",
    "pickup": "pickup_address",
    "origin": "pickup_address",
    "dropoff_location": "dropoff_address",
    "dropoff": "dropoff_address",
    "destination": "dropoff_address",
    "start_time": "start_at",
    "datetime": "start_at",
    "date_time": "start_at",
    "area": "location",
    "city": "location",
    "people": "party_size",
    "guests": "party_size",
    "specialty": "department",
    "department_name": "department",
    "symptom": "symptoms",
    "dish": "query",
    "food_query": "query",
}


def _canonical_model_slots(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    canonical: dict[str, Any] = {}
    for key, item in value.items():
        normalized_key = str(key).casefold()
        target_key = MODEL_SLOT_ALIASES.get(normalized_key, str(key))
        if target_key not in canonical:
            canonical[target_key] = item
    if "start_at" not in canonical:
        date = canonical.get("date")
        clock = canonical.get("time")
        if isinstance(date, str) and isinstance(clock, str):
            clock_match = re.fullmatch(r"(\d{1,2}):(\d{2})(?::(\d{2}))?", clock.strip())
            if clock_match:
                hours, minutes, seconds = clock_match.groups()
                canonical["start_at"] = (
                    f"{date.strip()}T{int(hours):02d}:{minutes}:{seconds or '00'}+07:00"
                )
    return canonical


def _normalized_datetime(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        return None
    return parsed.astimezone(ZoneInfo(TIMEZONE)).isoformat()


def _normalized_local_date(value: Any) -> str | None:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value.strip()):
        return None
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d").date().isoformat()
    except ValueError:
        return None


def _domain_slots(domain: str, value: Any) -> dict[str, Any]:
    """Keep semantic planner slots bounded and domain-shaped.

    The model may suggest user preferences, but it cannot smuggle identifiers,
    money, availability, or status into a domain request. Invalid values are
    dropped so the Gateway can ask for clarification instead of forwarding a
    malformed provider payload.
    """
    slots = _safe_slots(value)
    normalized: dict[str, Any] = {}

    def text_slot(name: str, limit: int) -> None:
        item = slots.get(name)
        if isinstance(item, str) and item.strip() and len(item.strip()) <= limit:
            normalized[name] = item.strip()

    if domain == "ride":
        for name in ("pickup_address", "dropoff_address"):
            text_slot(name, 300)
        vehicle = slots.get("vehicle_type")
        if vehicle in {"BIKE", "CAR_4", "CAR_7"}:
            normalized["vehicle_type"] = vehicle
        text_slot("promo_code", 50)
    elif domain == "restaurant":
        text_slot("location", 300)
        text_slot("cuisine_query", 200)
        text_slot("cuisine", 200)
        party_size = slots.get("party_size")
        if isinstance(party_size, int) and not isinstance(party_size, bool) and 1 <= party_size <= 20:
            normalized["party_size"] = party_size
        start_at = _normalized_datetime(slots.get("start_at"))
        if start_at:
            normalized["start_at"] = start_at
        selection = slots.get("selection")
        if selection in {"first", "second", "third", "fourth", "fifth"}:
            normalized["selection"] = selection
        selection_index = slots.get("selection_index")
        if isinstance(selection_index, int) and not isinstance(selection_index, bool) and 0 <= selection_index <= 99:
            normalized["selection_index"] = selection_index
    elif domain == "healthcare":
        for name, limit in (("department", 200), ("symptoms", 500)):
            text_slot(name, limit)
        appointment_date = _normalized_local_date(slots.get("appointment_date"))
        if appointment_date:
            normalized["appointment_date"] = appointment_date
        start_at = _normalized_datetime(slots.get("start_at"))
        if start_at:
            normalized["start_at"] = start_at
        preference = slots.get("time_preference")
        if isinstance(preference, str) and preference in {
        "morning", "afternoon", "evening", "tomorrow_morning", "tomorrow_afternoon", "tomorrow_evening"
        }:
            normalized["time_preference"] = preference
        selection = slots.get("selection")
        if selection in {"first", "second", "third", "fourth", "fifth"}:
            normalized["selection"] = selection
        selection_index = slots.get("selection_index")
        if isinstance(selection_index, int) and not isinstance(selection_index, bool) and 0 <= selection_index <= 99:
            normalized["selection_index"] = selection_index
    elif domain == "food":
        for name, limit in (("query", 300), ("dish_query", 300), ("location", 300), ("delivery_preference", 80)):
            text_slot(name, limit)
    return normalized


def _sanitize_plan(plan: AssistantPlan) -> AssistantPlan:
    tasks: list[PlannedTask] = []
    for index, task in enumerate(plan.tasks[:4]):
        dependencies = sorted({value for value in task.depends_on if 0 <= value < index})
        slots = _domain_slots(task.domain, _canonical_model_slots(task.extracted_slots))
        tasks.append(task.model_copy(update={"extracted_slots": slots, "depends_on": dependencies}))
    clarification = plan.clarification_question
    if clarification and len(clarification) > 500:
        clarification = clarification[:500]
    return plan.model_copy(update={"tasks": tasks, "clarification_question": clarification})


def _merge_explicit_semantics(plan: AssistantPlan, message: str) -> AssistantPlan:
    """Keep explicit user slots when a model response omits them.

    The model chooses the task shape, but the bounded deterministic extractor
    is the safer source for direct route, vehicle, selection, and preference
    phrases.  Merge only those semantic slots; identifiers and authoritative
    values still come from the Gateway/domain workflow.
    """
    tasks: list[PlannedTask] = []
    for task in plan.tasks:
        explicit = _semantic_slots(message, task.domain)
        if not explicit:
            tasks.append(task)
            continue
        slots = {**task.extracted_slots, **explicit}
        if task.domain == "healthcare" and "appointment_date" in explicit and "start_at" not in explicit:
            # The deterministic extraction is authoritative for explicit
            # relative dates; do not retain an older exact clock from the
            # planner or previous turn.
            slots.pop("start_at", None)
        tasks.append(task.model_copy(update={"extracted_slots": slots}))
    return plan.model_copy(update={"tasks": tasks})


def _enforce_reference_dependencies(plan: AssistantPlan, message: str) -> AssistantPlan:
    """Make the high-risk semantic reference boundary deterministic.

    A model may understand "đó" correctly but must not turn it into a
    destination. When the user asks for a dependent Ride after Healthcare or
    Restaurant, Gateway will resolve the address from the domain result.
    """
    lowered = _plain(message)
    reference = _has_any(lowered, ("nha hang do", "toi do", "dua toi toi do", "den do", "sau do", "roi dat xe", "sau do dat xe"))
    if not reference:
        return plan

    tasks: list[PlannedTask] = []
    for index, task in enumerate(plan.tasks):
        if task.domain != "ride":
            tasks.append(task)
            continue
        dependencies = list(task.depends_on)
        prior = [candidate_index for candidate_index, candidate in enumerate(plan.tasks[:index]) if candidate.domain in {"healthcare", "restaurant"}]
        if prior:
            dependencies = sorted(set(dependencies).union(prior))
        slots = dict(task.extracted_slots)
        if prior:
            slots.pop("dropoff_address", None)
        tasks.append(task.model_copy(update={"depends_on": dependencies, "extracted_slots": slots}))
    return plan.model_copy(update={"tasks": tasks})


def _parse_model(raw: Any, schema: type[BaseModel]) -> BaseModel:
    if isinstance(raw, schema):
        return raw
    if isinstance(raw, BaseModel):
        return schema.model_validate(raw.model_dump())
    if isinstance(raw, dict):
        if raw.get("parsed") is not None:
            return _parse_model(raw["parsed"], schema)
        if isinstance(raw.get("json"), dict):
            return schema.model_validate(raw["json"])
        if raw.get("raw") is not None:
            return _parse_model(raw["raw"], schema)
        return schema.model_validate(raw)
    content = getattr(raw, "content", raw)
    if isinstance(content, str):
        decoder = json.JSONDecoder()
        for index, character in enumerate(content):
            if character != "{":
                continue
            try:
                candidate, _ = decoder.raw_decode(content[index:])
                return schema.model_validate(candidate)
            except (json.JSONDecodeError, ValidationError):
                continue
    raise TypeError("Unsupported structured model output")


def _model_prompt(state: AssistantState) -> str:
    settings = get_settings()
    recent_messages = []
    for message in state.get("messages", [])[-12:]:
        if not isinstance(message, dict):
            continue
        role = message.get("role")
        content = _safe_model_text(message.get("content"), 1200)
        if role in {"user", "assistant"} and content:
            recent_messages.append({"role": role, "content": content})
    payload = {
        "system_prompt": XONE_SYSTEM_PROMPT,
        "current_time": _now().isoformat(),
        "timezone": TIMEZONE,
        "message": state.get("query", ""),
        "recent_messages": recent_messages,
        "conversation_state": _planner_safe_state(state.get("conversation_state", {})),
        "response_schema": AssistantPlan.model_json_schema(),
        "max_tasks": 4,
        "configured_model": settings.gemini_model,
    }
    return json.dumps(payload, ensure_ascii=False)


async def _invoke_structured(model: LLMAdapter, prompt: str, schema: type[BaseModel]) -> BaseModel:
    structured = getattr(model, "ainvoke_structured", None)
    raw = await structured(prompt, schema) if callable(structured) else await model.ainvoke(prompt)
    return _parse_model(raw, schema)


async def compose_response(
    message: str,
    tasks: list[dict[str, Any]],
    authoritative_results: list[dict[str, Any]],
    llm: LLMAdapter | None = None,
) -> tuple[str, str]:
    """Compose only a safe explanation around already-authoritative values."""
    settings = get_settings()
    use_model = llm is not None or (settings.agent_model_mode == "gemini" and bool(settings.gemini_api_key))
    fallback = "Mình đã cập nhật các lựa chọn và bước tiếp theo cho bạn."
    if not use_model:
        return fallback, "deterministic"
    model = llm or GeminiAdapter()
    safe_tasks = _planner_safe_state({"tasks": tasks}).get("tasks", [])
    safe_results = _safe_model_value(authoritative_results[:8])
    prompt = json.dumps(
        {
            "system_prompt": XONE_SYSTEM_PROMPT,
            "instruction": "Write one concise Vietnamese assistant message grounded only in the supplied results. Do not repeat hidden identifiers or change any number, price, status, name, or address. Mention the next explicit confirmation when present.",
            "user_message": message,
            "tasks": safe_tasks[:4],
            "authoritative_results": safe_results,
            "response_schema": AssistantComposition.model_json_schema(),
        },
        ensure_ascii=False,
    )
    try:
        result = await _invoke_structured(model, prompt, AssistantComposition)
        MODEL_DIAGNOSTICS.update({"last_model_call_at": _now().isoformat(), "last_model_call_status": "succeeded", "last_model_call_error": None})
        logger.info("assistant.composition.accepted model=%s", llm_diagnostics(settings)["last_model_used"])
        return str(result.message), "model"
    except Exception as error:  # provider errors are intentionally reduced to a safe fallback
        MODEL_DIAGNOSTICS.update({"last_model_call_at": _now().isoformat(), "last_model_call_status": "failed", "last_model_call_error": type(error).__name__})
        logger.warning("Assistant composition unavailable; deterministic fallback: %s", type(error).__name__)
        return fallback, "deterministic"


def build_assistant_graph(llm: LLMAdapter | None = None):
    settings = get_settings()
    model = llm or GeminiAdapter()
    use_model = llm is not None or (settings.agent_model_mode == "gemini" and bool(settings.gemini_api_key))

    async def decide(state: AssistantState) -> AssistantState:
        if state.get("mode", "plan") == "compose":
            message, source = await compose_response(
                str(state.get("query", "")),
                list(state.get("conversation_state", {}).get("tasks", [])),
                list(state.get("authoritative_results", [])),
                llm=model if use_model else None,
            )
            return {"assistant_message": message, "decision_source": source}
        if not use_model:
            plan = deterministic_plan(str(state.get("query", "")), state.get("conversation_state", {}))
            logger.info("assistant.model_decision.degraded reason=provider_not_configured tasks=%d", len(plan.tasks))
            return {"plan": plan.model_dump(), "assistant_message": plan.assistant_message, "decision_source": "deterministic"}
        try:
            message = str(state.get("query", ""))
            deterministic = deterministic_plan(message, state.get("conversation_state", {}))
            if _is_direct_healthcare_request(message) or (llm is None and len(deterministic.tasks) == 1):
                plan = deterministic
                logger.info("assistant.model_decision.fast_path tasks=%d", len(plan.tasks))
                return {"plan": plan.model_dump(), "assistant_message": plan.assistant_message, "decision_source": "deterministic"}
            plan = _sanitize_plan(await _invoke_structured(model, _model_prompt(state), AssistantPlan))
            plan = _sanitize_plan(_merge_explicit_semantics(plan, message))
            plan = _enforce_reference_dependencies(plan, message)
            MODEL_DIAGNOSTICS.update({"last_model_call_at": _now().isoformat(), "last_model_call_status": "succeeded", "last_model_call_error": None})
            runtime = llm_diagnostics(settings)
            logger.info("assistant.model_decision.accepted model=%s tasks=%d", runtime["last_model_used"], len(plan.tasks))
            return {
                "plan": plan.model_dump(),
                "assistant_message": plan.assistant_message,
                "decision_source": "model",
                "model": runtime["last_model_used"] or settings.gemini_model,
                "fallback_model": settings.gemini_fallback_model,
            }
        except Exception as error:  # validation/provider errors use the bounded semantic fallback
            MODEL_DIAGNOSTICS.update({"last_model_call_at": _now().isoformat(), "last_model_call_status": "failed", "last_model_call_error": type(error).__name__})
            logger.warning("Assistant planner unavailable; deterministic fallback: %s", type(error).__name__)
            plan = deterministic_plan(str(state.get("query", "")), state.get("conversation_state", {}))
            return {"plan": plan.model_dump(), "assistant_message": plan.assistant_message, "decision_source": "deterministic"}

    graph = StateGraph(AssistantState)
    graph.add_node("decide", decide)
    graph.set_entry_point("decide")
    graph.add_edge("decide", END)
    return graph.compile()


assistant_agent = build_assistant_graph()
