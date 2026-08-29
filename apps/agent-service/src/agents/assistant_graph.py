from __future__ import annotations

import json
import logging
import re
from contextvars import ContextVar
from datetime import datetime, timedelta
from time import perf_counter
from typing import Any, Literal, TypedDict

from langgraph.graph import END, StateGraph
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from src.agents.assistant.contracts import (
    AuthoritativeFact,
    CapabilitySnapshot,
    CoreAInput,
    Domain,
    PlannerContext,
    PlannerTaskContext,
    PlanningDecision,
)
from src.agents.assistant.planning import default_capability_snapshot
from src.agents.assistant.planning.planner import CoreAPlanner
from src.agents.assistant.understanding import semantic_turn_from_plan
from src.agents.assistant.understanding.temporal import PRODUCT_TIMEZONE, TemporalContext
from src.config import get_settings
from src.observability import (
    GenerationUsage,
    SafeObservationMetadata,
    extract_generation_usage,
    format_human_plan_output,
    get_telemetry,
)
from src.services.llm import (
    GeminiAdapter,
    LLMAdapter,
    llm_diagnostics,
    provider_error_category,
)

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
TIMEZONE = PRODUCT_TIMEZONE
STRUCTURED_CONVERSATION_RULES = """
Structured safety rules — these ALWAYS take precedence:
- interaction_mode=chitchat: social turns only, tasks=[].
- interaction_mode=advisory: general advice without booking/ordering, tasks=[].
- interaction_mode=service: concrete service request, populate tasks[] accordingly.
- discarded_task_refs: ONLY for in-progress conversation tasks the user explicitly abandons. NEVER discard COMPLETED tasks.
- Cancellation of a real booking/payment requires a typed cancellation workflow, NOT discarded_task_refs.
- Never fabricate live weather, traffic, or real-time facts unless explicitly provided in context.
- Never fabricate doctor names, restaurant names, food items, prices, or booking IDs.
- Ask only for information required by the next executable capability. Start discovery with any sufficient signal (dish/cuisine/location); defer party size, exact time, delivery address, and payment details until the user selects or explicitly requests the committing step. Reuse profile, saved addresses, prior selections, safe defaults, and authoritative results before asking.
- A Ride route may contain one user-requested intermediate stop. For a change such as "detour via <place> before the destination", emit that place only as `stopover_address`; preserve the existing pickup, destination, and vehicle from authoritative conversation context. A changed stop requires a fresh quote and a new service-details confirmation. Never invent a stop, coordinates, price, or availability.
- Maximum 1 clarification_question per response turn.
- Context precedence is fixed: explicit current-turn values, fresh UI context, authoritative conversation facts, saved profile context, then retrieved-memory hints. Never let a lower-precedence value overwrite a higher-precedence value.
""".strip()

XONE_SYSTEM_PROMPT = """Bạn là X-One — Trợ lý ảo đa dịch vụ thông minh, thân thiện và linh hoạt tại Việt Nam.

Khả năng dịch vụ cốt lõi:
1. Đặt xe di chuyển (ride): xe máy (BIKE), ô tô 4 chỗ (CAR_4), ô tô 7 chỗ (CAR_7), từ điểm đón (pickup_address) đến điểm trả (dropoff_address).
2. Giao đồ ăn tận nơi (food): tìm quán ăn, chọn món (dish_query), địa chỉ giao (location/address_reference).
3. Đặt bàn ăn tại nhà hàng (restaurant): tìm nhà hàng theo khu vực (location), loại ẩm thực (cuisine_query), số người (party_size), thời gian (start_at).
4. Đặt lịch khám sức khỏe (healthcare): chuyên khoa (department), bác sĩ, ngày hẹn (appointment_date), thời gian mong muốn (time_preference: morning, afternoon, evening).

Quy tắc ứng xử và bóc tách tác vụ:
- Thân thiện, tự nhiên, mang phong cách trợ lý chu đáo: luôn xưng "mình" và gọi người dùng là "bạn"; không dùng "em", "anh" hoặc "tôi".
- Chitchat / Tư vấn chung ("chào bạn", "bạn là ai", "hôm nay ăn gì ngon"): trả về `tasks: []`, `interaction_mode: "chitchat"` hoặc `"advisory"`.
- Yêu cầu dịch vụ cụ thể: trích xuất danh sách `tasks` chính xác.
- Khi người dùng ĐỔI Ý / HỦY BỎ yêu cầu cũ ("thôi không đi xe nữa, tìm quán phở"): điền task_ref của tác vụ cũ vào `discarded_task_refs` và chỉ tạo task mới.
- Chuỗi dịch vụ phụ thuộc ("Tìm quán lẩu ở Hoàn Kiếm rồi đặt xe đưa tôi tới đó"):
  + Task 0 (restaurant): Tìm nhà hàng ở Hoàn Kiếm.
  + Task 1 (ride): depends_on = [0], không tự bịa địa chỉ đến (dropoff_address để trống để Gateway lấy từ Task 0).
- Anchor-first: healthcare và restaurant là task neo có lịch/điểm đến cố định. Phải xác định hoặc hỏi thông tin còn thiếu của task neo trước khi lập các chặng ride phụ thuộc; không hỏi pickup/dropoff của ride khi điểm đến neo chưa được chọn.
- Task retention: khi lượt mới chỉ bổ sung thông tin di chuyển, giữ nguyên mọi task healthcare/restaurant đang PLANNING, NEEDS_INFO hoặc IN_PROGRESS trong conversation_state.tasks và hợp nhất slot mới; không thay thế chúng bằng task ride.
- Advisory trước khi phân rã: với nhiều chặng, nhiều điểm đón hoặc nhóm từ ba người trở lên, đưa ra tối đa hai phương án tuyến/xe và hỏi bạn chọn trước khi tạo hàng loạt task ride.
- Đa dịch vụ độc lập ("Tìm bún chả giao về nhà và đặt lịch khám tim mạch sáng mai"):
  + Task 0 (food): dish_query = "bún chả", delivery_preference = "home".
  + Task 1 (healthcare): department = "tim mach", time_preference = "tomorrow_morning".
- Tuyệt đối không tự bịa ID kỹ thuật hay số tiền cụ thể trong slots.
- TUYỆT ĐỐI KHÔNG tự bịa tên bác sĩ, nhà hàng, quán ăn nếu hệ thống không cung cấp.
- Khi người dùng nói thời gian chung chung (VD: "sáng mai", "chiều nay"), hãy dùng `time_preference` ("morning", "afternoon", "evening") thay vì dùng `start_at` cố định (trừ khi họ chỉ định giờ phút rõ ràng).
- Trả về tiếng Việt gãy gọn, tự nhiên.
- Nếu conversation_state chứa saved_addresses, bạn có thể tự động nhận diện và sử dụng các tên gọi (label) này (VD: "Nhà", "Công ty") làm địa điểm đặt xe, giao đồ ăn mà không cần hỏi lại.
"""

# Additional planner instructions from the current product prompt.
XONE_SYSTEM_PROMPT += """

Before building tasks, read user_profile, conversation_state.tasks, retrieved_memories, and recent_messages. Retrieved memories are contextual hints only: use them to resolve intent/preferences, never as authority for current prices, availability, orders, bookings, payments, or exact sensitive facts. Preserve COMPLETED tasks as history; only discard an in-progress task when the user explicitly abandons it. Map saved address phrases such as home to the matching saved-address label. For ambiguous or missing addresses, ask one clarification question or use location_query; never invent an exact address. Analyze intent, service count, dependencies, and required slots internally before emitting JSON. ride requires pickup_address and dropoff_address; food requires dish_query; restaurant requires location or cuisine_query; healthcare requires department. Maximum 4 tasks. Never claim success unless authoritative_results proves it.
For restaurant discovery, retain the user's stated cuisine, area, and time as semantic slots; do not create a reservation until a concrete restaurant is selected and the required party size/time are available. For an unconfirmed Ride route change that adds an intermediate stop, use `operation=UPDATE` and `stopover_address`; retain the active ride task rather than creating an unrelated ride.
Food delivery and restaurant services are limited to central Hanoi (Hoàn Kiếm, Ba Đình, Đống Đa, Hai Bà Trưng, Tây Hồ, Cầu Giấy). For another city or district, return interaction_mode="unsupported" with a brief polite Vietnamese refusal. For nearby food, use the user's selected delivery address district; do not claim nearby results until the Food search tool returns authoritative items.
Requests about programming, mathematics, politics, schoolwork, computer repair, or other non-X-One topics are unsupported: return interaction_mode="unsupported", tasks=[], and a brief Vietnamese refusal. Do not answer the unrelated question or provide code/instructions.
"""

COMPOSE_INSTRUCTION = """You are X-One composing a concise Vietnamese response from authoritative system results. Focus only on the current request and active tasks. Do not mention FAILED, DISCARDED, or old COMPLETED tasks unless the user explicitly asks about them. Keep anchor tasks (healthcare/restaurant) ahead of dependent ride steps and make the next required choice clear. When multiple choices exist, list at most three and ask the user to choose. Never invent IDs, prices, times, names, addresses, or statuses. Use success language only when authoritative_results.kind is booking_confirmed or order_confirmed. Always use first person 'mình' and address the user as 'bạn'; never use 'em', 'anh', or 'tôi'."""

_CONFIRMED_RESULT_KINDS = {"booking_confirmed", "order_confirmed"}


def _bounded_authoritative_results(value: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Expose only bounded public result fields to the composing model."""
    safe: list[dict[str, Any]] = []
    for item in value[:8]:
        if not isinstance(item, dict) or not isinstance(item.get("kind"), str):
            continue
        public: dict[str, Any] = {"kind": str(item["kind"])[:80]}
        for key in ("options", "items", "message", "question", "status", "summary"):
            candidate = item.get(key)
            if key in {"options", "items"} and isinstance(candidate, list):
                public[key] = _safe_model_value(candidate[:3])
            elif key in {"message", "question", "status", "summary"} and isinstance(candidate, str):
                public[key] = _safe_model_text(candidate, 500)
        safe.append(public)
    return safe[:3]


def _safe_composed_message(message: str, authoritative_results: list[dict[str, Any]]) -> str:
    if any(isinstance(item, dict) and item.get("kind") in _CONFIRMED_RESULT_KINDS for item in authoritative_results):
        return message
    normalized = _plain(message)
    if any(phrase in normalized for phrase in ("da dat thanh cong", "da xac nhan", "da thanh toan", "da dat hang", "da hoan tat")):
        return _deterministic_composition([], authoritative_results)
    if any(phrase in message.casefold() for phrase in ("đã đặt thành công", "đã xác nhận", "đã thanh toán", "đã đặt hàng", "đã hoàn tất")):
        return _deterministic_composition([], authoritative_results)
    return message


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

    reasoning: str = Field(default="", max_length=800, description="Internal intent, slot, and dependency analysis; never display to the user.")
    assistant_message: str = Field(default="Mình sẽ giúp bạn xử lý yêu cầu này.", max_length=1000)
    tasks: list[PlannedTask] = Field(default_factory=list, max_length=4)
    interaction_mode: Literal["service", "chitchat", "advisory", "unsupported"] = "service"
    discarded_task_refs: list[int] = Field(default_factory=list, max_length=8)
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
    capability_snapshot: dict[str, Any]
    authoritative_results: list[dict[str, Any]]
    user_profile: dict[str, Any]
    current_location: dict[str, Any]
    mode: Literal["plan", "compose"]
    plan: dict[str, Any]
    semantic_turn: dict[str, Any]
    planning_decision: dict[str, Any]
    assistant_message: str
    decision_source: str
    model: str
    fallback_model: str
    usage: dict[str, Any] | None
    error: str


_LAST_USAGE_VAR: ContextVar[GenerationUsage | None] = ContextVar("last_usage", default=None)

MODEL_DIAGNOSTICS: dict[str, Any] = {
    "last_model_call_at": None,
    "last_model_call_status": "not_called",
    "last_model_call_error": None,
}

_CORE_A_PLANNER = CoreAPlanner()


def plan_core_a(input_: CoreAInput) -> PlanningDecision:
    """Typed Core A seam.

    The compatibility understanding path currently projects `AssistantPlan`
    into `SemanticTurn`. Keep this seam free of dispatch and domain side
    effects while Core B extraction is completed.
    """
    return _CORE_A_PLANNER.plan(input_)


def _core_a_input(plan: AssistantPlan, state: AssistantState) -> CoreAInput:
    semantic_turn = semantic_turn_from_plan(
        plan.tasks,
        interaction_mode=plan.interaction_mode,
        discarded_task_refs=plan.discarded_task_refs,
        user_message=str(state.get("query", "")),
        conversation_state=(state.get("conversation_state", {}) if isinstance(state.get("conversation_state"), dict) else {}),
        current_location=(state.get("current_location", {}) if isinstance(state.get("current_location"), dict) else {}),
    )
    raw_context = state.get("conversation_state", {})
    context_tasks: list[PlannerTaskContext] = []
    raw_tasks = raw_context.get("tasks", []) if isinstance(raw_context, dict) else []
    for index, raw in enumerate(raw_tasks):
        if not isinstance(raw, dict):
            continue
        try:
            context_tasks.append(
                PlannerTaskContext(
                    task_ref=int(raw.get("task_ref", index)),
                    domain=Domain(str(raw.get("domain"))),
                    phase=str(raw.get("phase") or "PLANNING"),
                    revision=max(0, int(raw.get("revision", 0))),
                    depends_on=[item for item in raw.get("depends_on", []) if isinstance(item, int)],
                    facts=[
                        AuthoritativeFact.model_validate(item)
                        for item in raw.get("facts", [])
                        if isinstance(item, dict)
                    ][:32],
                )
            )
        except (TypeError, ValueError):
            continue
    raw_snapshot = state.get("capability_snapshot")
    snapshot = (
        CapabilitySnapshot.model_validate(raw_snapshot)
        if isinstance(raw_snapshot, dict)
        else default_capability_snapshot()
    )
    return CoreAInput(
        semantic_turn=semantic_turn,
        planner_context=PlannerContext(tasks=context_tasks),
        capability_snapshot=snapshot,
    )


def _typed_pipeline_result(
    plan: AssistantPlan,
    state: AssistantState,
    source: Literal["model", "deterministic"],
) -> AssistantState:
    telemetry = get_telemetry()
    with telemetry.observation(
        "planner.route",
        "chain",
        SafeObservationMetadata(
            decision_source=source,
            interaction_mode=plan.interaction_mode,
            task_count=len(plan.tasks),
            status="started",
        ),
        input={
            "interaction_mode": plan.interaction_mode,
            "assistant_message": plan.assistant_message,
            "raw_tasks_count": len(plan.tasks),
            "decision_source": source,
        },
    ) as planner_observation:
        input_ = _core_a_input(plan, state)
        with telemetry.observation(
            "core_a.validate",
            "guardrail",
            SafeObservationMetadata(status="started"),
            input={
                "task_count": len(input_.planner_context.tasks),
                "capability_snapshot_version": input_.capability_snapshot.version,
            },
        ) as validation_observation:
            try:
                decision = plan_core_a(input_)
            except Exception:
                validation_observation.update(
                    metadata=SafeObservationMetadata(
                        accepted=False,
                        status="failed",
                        error_code="core_a_validation_failed",
                    ),
                    output={"accepted": False, "error": "Core A validation failed"},
                )
                raise
            validation_observation.update(
                metadata=SafeObservationMetadata(
                    accepted=True,
                    status="succeeded",
                    contract_version=decision.contract_version,
                    capability_catalog_version=decision.capability_catalog_version,
                    clarification_required=decision.clarification_need is not None,
                    blocked_count=len(decision.blocked_task_refs),
                    discarded_count=len(decision.discarded_task_refs),
                ),
                output={
                    "accepted": True,
                    "contract_version": decision.contract_version,
                    "clarification_required": decision.clarification_need is not None,
                    "blocked_tasks": decision.blocked_task_refs,
                    "discarded_tasks": decision.discarded_task_refs,
                },
            )
        planner_observation.update(
            metadata=SafeObservationMetadata(
                decision_source=source,
                interaction_mode=decision.interaction_mode,
                workflow_relation=decision.workflow_relation,
                replan_directive=decision.replan_directive,
                task_count=len(decision.tasks),
                status="succeeded",
            ),
            output=format_human_plan_output(decision, plan.assistant_message),
        )
        for task in decision.tasks:
            steps = task.steps
            step_summaries = [
                f"[{step.step_kind}] {step.capability or step.confirmation_gate} (Risk: {step.risk_ceiling})"
                for step in steps
            ]
            with telemetry.observation(
                f"core_a.task [{task.domain.upper()}]",
                "span",
                SafeObservationMetadata(
                    task_index=task.task_ref,
                    domain=task.domain,
                    disposition=task.disposition,
                    dependency_count=len(task.depends_on),
                    step_kinds=[step.step_kind for step in steps],
                    capability_names=[
                        step.capability for step in steps if step.capability is not None
                    ],
                    risk_ceilings=list(
                        dict.fromkeys(str(step.risk_ceiling) for step in steps)
                    ),
                    confirmation_gates=list(
                        dict.fromkeys(str(step.confirmation_gate) for step in steps)
                    ),
                    status="succeeded",
                ),
                input={
                    "task_ref": task.task_ref,
                    "domain": task.domain,
                    "depends_on": task.depends_on,
                    "normalized_request": task.normalized_request,
                },
                output={
                    "disposition": task.disposition,
                    "step_count": len(steps),
                    "steps": step_summaries,
                },
            ):
                pass
    return {
        "plan": plan.model_dump(),
        "semantic_turn": input_.semantic_turn.model_dump(mode="json"),
        "planning_decision": decision.model_dump(mode="json"),
        "assistant_message": plan.assistant_message,
        "decision_source": source,
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
        "api_key_configured": bool(getattr(settings, "has_gemini_api_key", settings.gemini_api_key)),
        "last_model_call_at": runtime["last_model_call_at"],
        "last_model_call_status": runtime["last_model_call_status"],
        "last_model_call_error_type": runtime["last_model_call_error"],
        "last_model_call_http_status": runtime["last_model_call_http_status"],
        "last_model_call_category": runtime["last_model_call_category"],
        "last_model_call_invocation": runtime["last_model_call_invocation"],
    }


def _now() -> datetime:
    return TemporalContext.now()


def _plain(value: str) -> str:
    import unicodedata

    normalized = unicodedata.normalize("NFD", value.casefold())
    return "".join("d" if char == "đ" else char for char in normalized if unicodedata.category(char) != "Mn")


def _has_any(text: str, values: tuple[str, ...]) -> bool:
    return any(value in text for value in values)


def _is_direct_healthcare_request(text: str) -> bool:
    lowered = _plain(text)
    healthcare = _has_any(
        lowered, ("dat lich kham", "lich kham", "bac si", "kham", "chuyen khoa", "khoa", "dau dau", "trieu chung")
    )
    other_service = _has_any(
        lowered, ("goi xe", "dat xe", "nha hang", "dat ban", "dat mon", "giao do an", "ship do an")
    )
    return healthcare and not other_service


def _party_size(text: str, words: tuple[tuple[str, int], ...] = ()) -> int | None:
    match = re.search(r"\b([1-9][0-9]?)\s*(?:nguoi|khach|ban)\b", text)
    if match:
        return int(match.group(1))
    for word, value in words:
        if re.search(rf"\b{word}\s+(?:nguoi|khach|ban)\b", text):
            return value
    return None


_LOCATION_PATTERN = re.compile(r"\b(?:ở|tại|tai|o|khu vuc|đến|den)\b\s+([^,.!?;]+)", re.IGNORECASE)
_LOCATION_SUFFIX_PATTERN = re.compile(r"\b(?:roi|sau do|va|rồi|sau đó|và)\b", re.IGNORECASE)
_SHORT_LOCATION_PATTERN = re.compile(r"[\wÀ-ỹĐđ .,'-]+", re.UNICODE)
_MAX_HEURISTIC_INPUT_LENGTH = 512
_MAX_LOCATION_LENGTH = 160


def _location(text: str) -> str | None:
    location_patterns = (
        re.compile(r"\b(?:gần|gan)\b\s+([^,.!?;]+)", re.IGNORECASE),
        _LOCATION_PATTERN,
    )
    for candidate in (text, _plain(text)):
        bounded = candidate[:_MAX_HEURISTIC_INPUT_LENGTH]
        for pattern in location_patterns:
            for match in pattern.finditer(bounded):
                result = match.group(1).strip()
                result = re.split(
                    r"\b(?:roi|sau do|va|rồi|sau đó|và|lúc|luc|vào|vao|ngày|ngay|tối|toi|sáng|sang|trưa|trua|có|co|quán|quan|cho|xong|đồng\s+thời|dong\s+thoi|nhà\s*hàng|nha\s*hang)\b",
                    result,
                    maxsplit=1,
                    flags=re.IGNORECASE,
                )[0]
                result = re.sub(r"^(?:gần|gan)\s+", "", result, flags=re.IGNORECASE).strip()
                if _plain(result).strip() in {"do", "day", "nha hang do", "quan do"}:
                    continue
                if result:
                    return result
    return None


def _looks_like_short_location_reply(text: str) -> bool:
    """Conservatively recognize a standalone proper-name location reply.

    This is used only to continue one existing task. It avoids maintaining a
    list of campuses, hospitals, wards, or landmarks in the planner.
    """
    value = text.strip()
    words = value.split()
    if not 1 <= len(words) <= 8 or len(value) > 100:
        return False
    if not _SHORT_LOCATION_PATTERN.fullmatch(value):
        return False
    return any(character.isupper() for character in value)


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

    # A route that names a pickup but refers only to "there" intentionally
    # carries no destination. The
    # dependent domain must provide the destination; the planner must not
    # turn the reference "đó" into an invented address.
    return None, None


def _strip_vehicle_suffix(value: str) -> str:
    result = value
    for _ in range(2):
        result = re.sub(
            r"\s+(?:cho\s+)?(?:[1-9][0-9]?|một|mot|hai|ba|bốn|bon|năm|nam|sáu|sau|bảy|bay)\s*(?:người|nguoi|khách|khach|passengers?)\s*$",
            "",
            result,
            flags=re.IGNORECASE,
        )
        result = re.sub(
            r"\s+(?:bằng|bang|với|voi)\s+(?:xe\s*)?(?:máy|may|[47]\s*(?:chỗ|cho)|bike|car[_ ]?[47])\s*$",
            "",
            result,
            flags=re.IGNORECASE,
        )
    return result.strip()


def _clean_changed_route_value(value: str) -> str | None:
    value = re.sub(r"^(?:qua|sang|thành|thanh|là|la|tới|toi)\s+", "", value, flags=re.IGNORECASE)
    value = re.sub(
        r"\s+(?:và\s+)?(?:đổi|doi|thay|chuyển|chuyen)?\s*" r"(?:phương tiện|phuong tien|loại xe|loai xe).*$",
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


def _stopover_address(text: str) -> str | None:
    """Extract one explicit intermediate stop for the offline fallback only."""

    marker = r"(?:tạt\s+qua|tat\s+qua|ghé\s+qua|ghe\s+qua|dừng\s+(?:ở|o|tại|tai)|dung\s+(?:o|tai))"
    suffix = r"(?=\s+(?:rồi|roi|trước\s+khi|truoc\s+khi|mới|moi|đến|den)\b|[,.!?]|$)"
    for candidate in (text, _plain(text)):
        match = re.search(rf"\b{marker}\s+(?:chỗ\s+|cho\s+|địa\s+điểm\s+|dia\s+diem\s+)?(?P<value>.+?){suffix}", candidate, re.IGNORECASE)
        if not match:
            continue
        value = re.sub(r"\s+(?:giúp\s+(?:tôi|mình)|giup\s+(?:toi|minh)|để|de)\b.*$", "", match.group("value"), flags=re.IGNORECASE)
        value = _clean_changed_route_value(value)
        if value:
            return value
    return None


def _has_explicit_clock(text: str) -> bool:
    lowered = _plain(text)
    return bool(re.search(r"\b\d{1,2}(?:\s*(?:gio|h)|:[0-5]\d)\b", lowered))


def _time_slot(text: str, now: datetime | None = None) -> str | None:
    resolution = TemporalContext.resolve_clock(text, now)
    return resolution.value.isoformat() if resolution.value is not None else None


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
    party_size = _party_size(lowered, (("mot", 1), ("hai", 2), ("ba", 3), ("bon", 4), ("nam", 5)))
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
        stopover = _stopover_address(text)
        if stopover:
            slots["stopover_address"] = stopover
        if "4 cho" in lowered or "bon cho" in lowered:
            slots["vehicle_type"] = "CAR_4"
        elif "7 cho" in lowered or "bay cho" in lowered:
            slots["vehicle_type"] = "CAR_7"
        elif "xe may" in lowered:
            slots["vehicle_type"] = "BIKE"
        passenger_match = re.search(r"\b([1-9][0-9]?)\s*(?:nguoi|khach|passengers?)\b", lowered)
        if passenger_match:
            slots["passenger_count"] = int(passenger_match.group(1))
        else:
            for word, count in (("mot", 1), ("hai", 2), ("ba", 3), ("bon", 4), ("nam", 5), ("sau", 6), ("bay", 7)):
                if re.search(rf"\b{word}\s+(?:nguoi|khach)\b", lowered):
                    slots["passenger_count"] = count
                    break
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
            cuisine_match = re.search(r"\b(?:muon an|thich an|an|quan|nha hang)\b\s+([^,.!?]+)", lowered, flags=re.IGNORECASE)
            if cuisine_match:
                cuisine = re.split(r"\b(?:luc|vao|toi|sang|trua|nao|co|con|ban)\b", cuisine_match.group(1), maxsplit=1)[0].strip()
                cuisine = re.sub(r"^an\s+", "", cuisine).strip()
                if cuisine and cuisine not in {"tai nha hang", "nha hang"}:
                    slots["cuisine_query"] = cuisine
    if domain == "food":
        if "giao ve nha" in lowered or "giao toi nha" in lowered or "ship" in lowered:
            slots["delivery_preference"] = "home"
        if "giao ve nha" in lowered or "giao toi nha" in lowered:
            slots["address_reference"] = "home"
        dish_match = re.search(
            r"(?:pho|bún|bun|com|burger|pizza|ga ran|ga chien|hamburger|do an|mon)\s+[^,.;!?]+", lowered
        )
        if dish_match:
            dish_query = re.split(
                r"\b(?:giao\s+(?:ve|toi)|ship|den\s+|(?:va|roi)\s+(?:dat|goi)|dat\s+lich|goi\s+xe)\b",
                dish_match.group(0),
                maxsplit=1,
            )[0].strip()
            dish_query = re.sub(r"^(?:cho toi|cho minh|giup toi|giup minh)\s+", "", dish_query).strip()
            if dish_query:
                slots["dish_query"] = dish_query
        elif _has_any(lowered, ("an trua", "bua trua")):
            slots["dish_query"] = "cơm, phở, bún"
            slots["category"] = "ăn trưa"
        elif _has_any(lowered, ("an sang", "bua sang")):
            slots["dish_query"] = "phở, bún, bánh mì"
            slots["category"] = "ăn sáng"
        elif _has_any(lowered, ("an toi", "bua toi")):
            slots["dish_query"] = "cơm, lẩu, nướng"
            slots["category"] = "ăn tối"
        elif _has_any(lowered, ("goi y", "an gi", "mon ngon")):
            slots["dish_query"] = "phở, bún, cơm"
        location = _location(text)
        if location:
            slots["location"] = location
        if "fast food" in lowered or "do an nhanh" in lowered:
            slots["category"] = "fast food"
    if domain == "healthcare":
        department_match = re.search(r"\bkhoa\s+([^,.!?;:]+)", lowered)
        if department_match:
            slots["department"] = department_match.group(1).strip()
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
    if (
        "chon cai dau tien" in lowered
        or "chon quan dau tien" in lowered
        or "chon nha hang dau tien" in lowered
        or "mon so mot" in lowered
    ):
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
        # Discovery can begin with a location or cuisine alone. Booking details
        # become mandatory only after the user asks to reserve/hold a table.
        booking_intent = _has_any(_plain(text), ("dat ban", "giu ban", "dat cho", "an toi", "an trua"))
        if not slots.get("location") and not slots.get("cuisine_query") and not slots.get("cuisine_type") and not slots.get("cuisine"):
            missing.append("location|cuisine_query")
        if booking_intent:
            for key in ("party_size", "start_at"):
                if not slots.get(key):
                    missing.append(key)
    if domain == "ride":
        for key in ("pickup_address", "vehicle_type"):
            if not slots.get(key):
                missing.append(key)
        # A dependent ride may receive its destination from an authoritative
        # Healthcare or Restaurant result after the prerequisite is held/selected.
        if not slots.get("dropoff_address") and not depends_on:
            missing.append("dropoff_address")
    return PlannedTask(
        domain=domain,
        goal=goal,
        normalized_request=text[:2000],
        extracted_slots=slots,
        depends_on=depends_on or [],
        needs_clarification=bool(missing),
        missing_information=missing,
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
        if str(value.get("phase", "")) in {"COMPLETED", "FAILED", "BLOCKED", "DISCARDED"}:
            continue
        active.append((index, value))
    if not active:
        return []

    food_words = (
        "chon quan",
        "chon mon",
        "pho",
        "bun",
        "com",
        "bat",
        "co lon",
        "ga ran",
        "ga chien",
        "fast food",
        "do an nhanh",
        "goi y",
        "gan day",
        "khong cay",
        "giao ve",
        "giao toi",
        "ship",
        "dia chi",
        "ap ma",
        "tong tien",
        "xem tong",
        "dat luon",
    )
    healthcare_words = ("lich kham", "bac si", "kham", "khoa", "than kinh", "tam ly", "chon lich", "trieu chung")
    # A bare "N người" follow-up keeps the established Restaurant flow when
    # both Restaurant and Ride are active. Ride passenger edits remain
    # unambiguous when the message names the ride/vehicle or Ride is the only
    # active task.
    restaurant_words = ("dat ban", "nha hang", "chon nha hang", "so nguoi", "nguoi", "khach")
    ride_words = (
        "dat xe",
        "goi xe",
        "di tu",
        "xe may",
        "xe 4 cho",
        "xe 7 cho",
        "doi phuong tien",
        "thay phuong tien",
        "loai xe",
        "tat qua",
        "ghe qua",
        "diem dung",
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
        missing_matches: list[int] = []
        for index, task in active:
            domain = str(task.get("domain"))
            semantic = _semantic_slots(message, domain)
            if semantic or (
                domain == "restaurant" and _has_any(lowered, ("hoan kiem", "ha noi", "cau giay", "tay ho", "ba dinh"))
            ):
                matches.append(index)
                missing = task.get("missing_information", [])
                if isinstance(missing, list) and any(field in missing for field in semantic):
                    missing_matches.append(index)
        if len(missing_matches) == 1:
            matches = missing_matches

    if not matches and len(active) == 1:
        matches = [active[0][0]]
    return sorted(set(matches))


def _discard_targets(message: str, previous_tasks: list[Any]) -> list[int]:
    """Recognize abandonment of conversation work, never domain cancellation."""
    lowered = _plain(message)
    abandonment = _has_any(
        lowered,
        (
            "thoi khong",
            "khong can",
            "bo yeu cau",
            "bo qua yeu cau",
            "dung yeu cau",
            "dung tim",
            "chuyen sang",
            "doi sang",
        ),
    ) or bool(re.search(r"\bkhong\b.{0,80}\bnua\b", lowered))
    if not abandonment:
        return []

    active: list[tuple[int, dict[str, Any]]] = []
    for index, value in enumerate(previous_tasks[:8]):
        if not isinstance(value, dict):
            continue
        if value.get("domain") not in SUPPORTED_DOMAINS:
            continue
        if str(value.get("phase", "")) in {"COMPLETED", "FAILED", "BLOCKED", "DISCARDED"}:
            continue
        active.append((index, value))
    if not active:
        return []

    direct_patterns = {
        "ride": (
            r"\bkhong\b.{0,30}\b(?:di|dat|goi)?\s*xe\b",
            r"\b(?:bo|dung)\b.{0,30}\bxe\b",
            r"\bkhong di nua\b",
        ),
        "food": (
            r"\bkhong\b.{0,30}\b(?:dat mon|do an|giao do an)\b",
            r"\b(?:bo|dung)\b.{0,30}\b(?:mon|do an)\b",
        ),
        "restaurant": (
            r"\bkhong\b.{0,30}\b(?:dat ban|nha hang)\b",
            r"\b(?:bo|dung)\b.{0,30}\b(?:dat ban|nha hang)\b",
        ),
        "healthcare": (
            r"\bkhong\b.{0,30}\b(?:kham|lich kham|bac si)\b",
            r"\b(?:bo|dung)\b.{0,30}\b(?:kham|lich kham)\b",
        ),
    }
    targeted_domains = {
        domain
        for domain, patterns in direct_patterns.items()
        if any(re.search(pattern, lowered) for pattern in patterns)
    }
    if targeted_domains:
        return [index for index, task in active if task.get("domain") in targeted_domains]
    if len(active) == 1:
        return [active[0][0]]
    return []


def _conversation_only_plan(text: str, lowered: str) -> AssistantPlan | None:
    identity = _has_any(lowered, ("ban la ai", "ban lam duoc gi", "ban co the lam gi", "x-one la gi"))
    greeting = bool(re.fullmatch(r"\s*(?:xin chao|chao|chao ban|hello|hi|hey)[!.?\s]*", lowered))
    wellbeing = _has_any(lowered, ("hom nay ban the nao", "ban khoe khong", "ban dang lam gi"))
    thanks = bool(re.fullmatch(r"\s*(?:cam on|cam on ban|thank you|thanks)[!.?\s]*", lowered))
    if identity:
        return AssistantPlan(
            interaction_mode="chitchat",
            assistant_message=(
                "Mình là X-One, trợ lý giúp bạn tìm món giao tận nơi, đặt xe, đặt bàn "
                "và tìm lịch khám. Bạn cứ nói điều mình đang cần theo cách tự nhiên nhé."
            ),
        )
    if greeting or wellbeing:
        return AssistantPlan(
            interaction_mode="chitchat",
            assistant_message=(
                "Chào bạn! Mình đang rất ổn và sẵn sàng đồng hành cùng bạn. "
                "Hôm nay bạn muốn tìm món ngon, gọi xe, đặt bàn hay xem lịch khám?"
            ),
        )
    if thanks:
        return AssistantPlan(
            interaction_mode="chitchat",
            assistant_message="Rất vui vì giúp được bạn. Khi cần thêm gì, cứ gọi mình nhé!",
        )

    if _has_any(
        lowered,
        (
            "python", "javascript", "typescript", "viet code", "lap trinh",
            "toan hoc", "chinh tri", "lam bai tap", "sua may tinh",
        ),
    ):
        return AssistantPlan(
            interaction_mode="unsupported",
            assistant_message=(
                "Xin lỗi bạn, mình chỉ hỗ trợ đặt xe, đồ ăn, nhà hàng và lịch khám. "
                "Bạn muốn mình hỗ trợ dịch vụ nào?"
            ),
        )

    if _has_any(lowered, ("troi mua di dau", "nen di dau khi mua", "mua gio di dau")):
        return AssistantPlan(
            interaction_mode="advisory",
            assistant_message=(
                "Nếu trời đang mưa, bạn có thể ưu tiên một quán ăn ấm cúng, cà phê có chỗ ngồi trong nhà "
                "hoặc địa điểm gần để đỡ di chuyển. Mình không xem được thời tiết trực tiếp, nhưng có thể "
                "giúp bạn tìm nhà hàng hoặc gọi xe khi bạn cho mình khu vực nhé."
            ),
        )

    advisory = _has_any(
        lowered,
        (
            "troi mua lanh the nay nen an gi",
            "troi mua lanh",
            "troi lanh the nay",
            "mua lanh the nay",
        ),
    ) and not _has_any(
        lowered, ("giao ve", "ship", "dat mon", "cho toi", "tim mon", "an trua", "an sang", "an toi", "goi y cho toi")
    )
    if advisory:
        weather_note = (
            "Nếu đúng là trời đang mưa lạnh, " if _has_any(lowered, ("troi mua", "troi lanh", "mua lanh")) else ""
        )
        return AssistantPlan(
            interaction_mode="advisory",
            assistant_message=(
                f"{weather_note}một bát phở, bún bò, cháo nóng hoặc món lẩu nhỏ sẽ khá hợp. "
                "Bạn thích món nước, món cay hay món nhẹ để mình gợi ý sát khẩu vị hơn?"
            ),
        )

    return None


def _temporal_boundary_plan(text: str) -> AssistantPlan | None:
    utility = TemporalContext.utility_response(text)
    if utility is not None:
        return AssistantPlan(interaction_mode="chitchat", assistant_message=utility)
    lowered = _plain(text)
    if not _has_any(
        lowered,
        ("dat", "giu ban", "goi xe", "lich kham", "kham", "nha hang", "giao", "ship"),
    ):
        return None
    resolution = TemporalContext.resolve_clock(text)
    if resolution.past_explicit:
        return AssistantPlan(
            interaction_mode="advisory",
            assistant_message=(
                "Thời điểm bạn nêu đã qua nên mình chưa thể tạo yêu cầu dịch vụ. "
                "Bạn cho mình một ngày hoặc giờ trong tương lai nhé."
            ),
        )
    if resolution.ambiguous_past_clock and _has_explicit_clock(text):
        return AssistantPlan(
            interaction_mode="advisory",
            assistant_message=(
                "Giờ bạn nêu hôm nay đã qua. Bạn muốn dùng giờ đó vào ngày mai phải không?"
            ),
            needs_clarification=True,
            clarification_question="Bạn muốn dùng giờ đó vào ngày mai phải không?",
        )
    return None


def _ride_cancellation_plan(text: str, conversation_state: dict[str, Any] | None) -> AssistantPlan | None:
    lowered = _plain(text)
    if not _has_any(lowered, ("huy chuyen", "huy dat xe", "huy cuoc", "huy xe", "cancel ride")):
        return None
    raw_tasks = conversation_state.get("tasks", []) if isinstance(conversation_state, dict) else []
    active = next(
        (
            item
            for item in raw_tasks
            if isinstance(item, dict)
            and item.get("domain") == "ride"
            and item.get("phase") not in {"COMPLETED", "FAILED", "BLOCKED", "DISCARDED"}
        ),
        None,
    )
    if active is None:
        return AssistantPlan(
            interaction_mode="advisory",
            assistant_message="Mình chưa thấy chuyến xe đang hoạt động trong cuộc trò chuyện này để chuẩn bị hủy.",
        )
    slots = active.get("extracted_slots") if isinstance(active.get("extracted_slots"), dict) else {}
    task = PlannedTask(
        domain="ride",
        goal="Chuẩn bị hủy chuyến xe đang hoạt động",
        normalized_request=text[:2000],
        extracted_slots=dict(slots),
    )
    return AssistantPlan(
        assistant_message="Mình đã chuẩn bị bước hủy chuyến. Bạn kiểm tra rồi xác nhận hủy bằng nút bên dưới nhé.",
        tasks=[task],
    )


def deterministic_plan(message: str, conversation_state: dict[str, Any] | None = None) -> AssistantPlan:
    """Conservative offline fallback used only when the provider is unavailable."""
    text = message.strip()
    lowered = _plain(text)
    previous = conversation_state or {}
    previous_tasks = previous.get("tasks", []) if isinstance(previous.get("tasks", []), list) else []
    cancellation_plan = _ride_cancellation_plan(text, previous)
    if cancellation_plan is not None:
        return cancellation_plan
    unsupported = _has_any(lowered, ("may bay", "chuyen bay", "flight", "khach san", "hotel", "tau hoa", "train"))
    if unsupported:
        return AssistantPlan(
            assistant_message="Mình chưa hỗ trợ đặt vé máy bay, phòng khách sạn hoặc vé tàu trong các dịch vụ hiện có.",
            tasks=[],
            interaction_mode="unsupported",
        )

    conversation_plan = _conversation_only_plan(text, lowered)
    if conversation_plan is not None:
        return conversation_plan

    follow_up = _has_any(
        lowered,
        (
            "oke",
            "ok",
            "uh",
            "ừ",
            "duoc",
            "được",
            "dong y",
            "đồng ý",
            "goi y di",
            "gợi ý đi",
            "tim di",
            "chon cai",
            "chon quan",
            "chon mon",
            "nguoi",
            "hoan kiem",
            "doi diem den",
            "doi diem don",
            "thay diem den",
            "thay diem don",
            "chuyen diem den",
            "doi phuong tien",
            "thay phuong tien",
            "loai xe",
            "tat qua",
            "ghe qua",
            "diem dung",
            "xe may",
            "xac nhan",
            "xe 4 cho",
            "xe 7 cho",
            "sang mai",
            "toi nay",
            "ngay mai",
            "ngay kia",
            "gio",
            "khoa",
            "tam ly",
            "co lon",
            "khong cay",
            "giao ve",
            "ap ma",
            "tong tien",
            "dat luon",
            "ga ran",
            "ga chien",
            "fast food",
            "do an nhanh",
            "goi y",
            "gan day",
        ),
    )
    explicit_restaurant = _has_any(
        lowered,
        ("dat ban", "nha hang", "an tai nha hang", "an toi tai", "con ban", "ban trong", "dat cho"),
    )
    explicit_food = _has_any(
        lowered,
        (
            "giao ve",
            "giao toi",
            "ship",
            "dat mon",
            "pho",
            "bun",
            "com",
            "do an",
            "ga ran",
            "ga chien",
            "fast food",
            "goi y",
            "gan day",
            "an trua",
            "bua trua",
            "an toi",
            "bua toi",
            "an sang",
            "bua sang",
            "mon an",
            "mon ngon",
            "an gi",
            "thich an",
        ),
    ) and not (explicit_restaurant and "giao" not in lowered)
    explicit_healthcare = _has_any(
        lowered, ("dat lich kham", "lich kham", "bac si", "kham", "than kinh", "dau dau", "trieu chung")
    )
    explicit_ride = (
        _has_any(lowered, ("dat xe", "goi xe", "muon xe", "can xe", "di tu", "tu ")) and (
            _route(text)[0] is not None or "xe" in lowered
        )
    ) or _stopover_address(text) is not None

    tasks: list[PlannedTask] = []
    if explicit_restaurant:
        tasks.append(
            _task("restaurant", text, "Tìm và đặt bàn tại nhà hàng phù hợp", _semantic_slots(text, "restaurant"))
        )
    if explicit_food:
        tasks.append(_task("food", text, "Tìm món và chuẩn bị đơn giao tận nơi", _semantic_slots(text, "food")))
    if explicit_healthcare:
        tasks.append(
            _task("healthcare", text, "Tìm khoa, bác sĩ và lịch khám phù hợp", _semantic_slots(text, "healthcare"))
        )
    if explicit_ride:
        ride_slots = _semantic_slots(text, "ride")
        # A stopover-only follow-up is a material edit to the active route. The
        # offline fallback retains the existing semantic route so Core A can
        # request a fresh quote instead of asking for the same endpoints again.
        if ride_slots.get("stopover_address") and not ride_slots.get("pickup_address") and not ride_slots.get("dropoff_address"):
            active_ride = next(
                (
                    item for item in previous_tasks
                    if isinstance(item, dict)
                    and item.get("domain") == "ride"
                    and item.get("phase") not in {"COMPLETED", "FAILED", "BLOCKED", "DISCARDED"}
                ),
                None,
            )
            if isinstance(active_ride, dict) and isinstance(active_ride.get("extracted_slots"), dict):
                ride_slots = {**active_ride["extracted_slots"], **ride_slots}
        dropoff = str(ride_slots.get("dropoff_address", ""))
        placeholder_destination = _plain(dropoff).strip() in {"do", "toi do", "den do", "nha hang do"}
        references_prior_destination = (not dropoff or placeholder_destination) and _has_any(
            lowered,
            ("nha hang do", "toi do", "qua do", "dua toi toi do", "sau do", "roi dat xe", "sau do dat xe"),
        )
        dependencies = [
            index
            for index, item in enumerate(tasks)
            if item.domain in {"restaurant", "healthcare"} and references_prior_destination
        ]
        tasks.append(_task("ride", text, "Tìm chuyến xe phù hợp", ride_slots, dependencies))

    discarded_task_refs = _discard_targets(text, previous_tasks)
    concise_location_reply = _looks_like_short_location_reply(text)
    if not tasks and not discarded_task_refs and previous_tasks and (follow_up or concise_location_reply):
        targets = _follow_up_targets(text, previous_tasks)
        if len(targets) > 1:
            question = "Bạn muốn tiếp tục với yêu cầu nào: món ăn, đặt bàn hay lịch khám?"
            return AssistantPlan(
                assistant_message=question, tasks=[], needs_clarification=True, clarification_question=question
            )
        if targets:
            item = previous_tasks[targets[0]]
            if isinstance(item, dict):
                domain = str(item.get("domain", ""))
                if domain in SUPPORTED_DOMAINS:
                    slots = (
                        dict(item.get("extracted_slots", {})) if isinstance(item.get("extracted_slots"), dict) else {}
                    )
                    explicit_slots = _semantic_slots(text, domain)
                    # A new day without a clock supersedes an old exact clock.
                    # Keeping it would incorrectly constrain the new day to the
                    # prior appointment time.
                    if (
                        domain == "healthcare"
                        and "appointment_date" in explicit_slots
                        and "start_at" not in explicit_slots
                    ):
                        slots.pop("start_at", None)
                    slots.update(explicit_slots)
                    if (
                        domain == "restaurant"
                        and not slots.get("location")
                        and _has_any(lowered, ("hoan kiem", "ha noi", "cau giay", "tay ho", "ba dinh"))
                    ):
                        slots["location"] = text
                    if domain == "restaurant":
                        party_size = _party_size(lowered, (("mot", 1), ("hai", 2), ("ba", 3), ("bon", 4)))
                        if party_size is not None and _has_any(lowered, ("nguoi", "khach", "ban")):
                            slots["party_size"] = party_size
                    tasks.append(
                        _task(
                            domain,
                            str(item.get("normalized_request", text)),
                            str(item.get("goal", "Tiếp tục yêu cầu")),
                            slots,
                        )
                    )

    if not tasks and discarded_task_refs:
        return AssistantPlan(
            assistant_message="Được, mình sẽ dừng phần yêu cầu đang dang dở này.",
            discarded_task_refs=discarded_task_refs,
        )
    if not tasks:
        conversation_plan = _conversation_only_plan(text, lowered)
        if conversation_plan is not None:
            return conversation_plan
        return AssistantPlan(
            assistant_message="Mình có thể giúp bạn đặt xe, tìm đồ ăn, đặt bàn hoặc tìm lịch khám. Bạn muốn bắt đầu từ việc nào?"
        )
    if len(tasks) == 1 and tasks[0].needs_clarification:
        missing = tasks[0].missing_information
        labels = {
            "location": "khu vực",
            "party_size": "số người",
            "start_at": "thời gian",
            "pickup_address": "điểm đón",
            "dropoff_address": "điểm đến",
            "vehicle_type": "loại xe (xe máy, ô tô 4 chỗ hoặc ô tô 7 chỗ)",
        }
        question = "Bạn cho mình biết thêm " + " và ".join(labels.get(value, value) for value in missing[:2]) + " nhé?"
        return AssistantPlan(
            assistant_message=question, tasks=tasks, needs_clarification=True, clarification_question=question
        )
    assistant_message = (
        "Được, mình sẽ bỏ phần yêu cầu cũ đang dang dở và chuyển sang việc bạn vừa nhờ."
        if discarded_task_refs
        else f"Mình sẽ giúp bạn xử lý {len(tasks)} việc trong cùng cuộc trò chuyện."
    )
    return AssistantPlan(
        assistant_message=assistant_message,
        tasks=tasks,
        discarded_task_refs=discarded_task_refs,
    )


def _safe_slots(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    safe: dict[str, Any] = {}
    for key, item in value.items():
        normalized = str(key).casefold()
        if (
            normalized.endswith("_id")
            or normalized in FORBIDDEN_MODEL_FIELDS
            or normalized in {"price", "amount", "currency", "availability", "available", "status"}
        ):
            continue
        if isinstance(item, str | int | float | bool) or item is None:
            safe[str(key)] = item
        elif (
            isinstance(item, list)
            and len(item) <= 8
            and all(isinstance(entry, str | int | float | bool) for entry in item)
        ):
            safe[str(key)] = item
    return safe


def _safe_model_text(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()[:limit]
    if re.search(
        r"(?:confirmation|workflow|tool[_ -]?call|reservation|appointment|booking|order)[_: -][a-z0-9-]+",
        text,
        flags=re.IGNORECASE,
    ):
        return ""
    return text


def _planner_safe_state(value: Any) -> dict[str, Any]:
    """Project stored Gateway state to semantic routing context only."""
    if not isinstance(value, dict):
        return {}
    raw_tasks = value.get("tasks", [])
    if not isinstance(raw_tasks, list):
        raw_tasks = []
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
        if str(raw_task.get("phase", "PLANNING")) == "COMPLETED":
            safe_task["completed"] = True
        pending_actions = raw_task.get("pending_actions", [])
        if isinstance(pending_actions, list):
            safe_actions = [
                str(item)
                for item in pending_actions
                if str(item)
                in {
                    "select_restaurant",
                    "restaurant_confirm",
                    "ride_service",
                    "ride_payment",
                    "select_healthcare_slot",
                    "healthcare_payment",
                    "healthcare_confirm",
                    "select_food_item",
                    "food_confirm",
                    "food_payment",
                }
            ]
            if safe_actions:
                safe_task["pending_actions"] = safe_actions
        pending_choice = raw_task.get("pending_choice")
        if isinstance(pending_choice, dict):
            kind = pending_choice.get("kind")
            count = pending_choice.get("count")
            if isinstance(kind, str) and isinstance(count, int) and 0 <= count <= 20:
                safe_task["pending_choice"] = {"kind": kind[:80], "count": count}
        tasks.append(safe_task)
    safe_state: dict[str, Any] = {"tasks": tasks}
    raw_addresses = value.get("saved_addresses", [])
    if isinstance(raw_addresses, list):
        addresses: list[dict[str, Any]] = []
        for raw in raw_addresses[:12]:
            if not isinstance(raw, dict):
                continue
            address = {
                key: raw[key]
                for key in (
                    "label",
                    "address_text",
                    "latitude",
                    "longitude",
                    "city",
                    "district",
                    "ward",
                    "is_default",
                    "provider",
                    "source",
                )
                if isinstance(raw.get(key), str | int | float | bool)
            }
            if address.get("label") and address.get("address_text"):
                addresses.append(address)
        if addresses:
            safe_state["saved_addresses"] = addresses
    memories = value.get("retrieved_memories", [])
    if isinstance(memories, list):
        safe_memories = [_safe_model_value(item) for item in memories[:8]]
        safe_state["retrieved_memories"] = [item for item in safe_memories if item]
    selected = value.get("selected_resource")
    if isinstance(selected, dict):
        safe_selected = _safe_model_value(selected)
        if safe_selected:
            safe_state["selected_resource"] = safe_selected
    return safe_state


def _safe_model_value(value: Any, depth: int = 0) -> Any:
    if depth > 4:
        return None
    if isinstance(value, dict):
        result: dict[str, Any] = {}
        for key, item in value.items():
            normalized = str(key).casefold()
            if (
                normalized.endswith("_id")
                or normalized in FORBIDDEN_MODEL_FIELDS
                or normalized
                in {
                    "workflow_id",
                    "tool_call_id",
                    "provider_reference",
                    "resource_version",
                }
            ):
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
                canonical["start_at"] = f"{date.strip()}T{int(hours):02d}:{minutes}:{seconds or '00'}+07:00"
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
    return parsed.astimezone(TemporalContext.timezone).isoformat()


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
        for name in ("pickup_address", "dropoff_address", "stopover_address"):
            text_slot(name, 300)
        for name in ("pickup_latitude", "dropoff_latitude"):
            coordinate = slots.get(name)
            if isinstance(coordinate, int | float) and not isinstance(coordinate, bool) and -90 <= coordinate <= 90:
                normalized[name] = float(coordinate)
        for name in ("pickup_longitude", "dropoff_longitude"):
            coordinate = slots.get(name)
            if isinstance(coordinate, int | float) and not isinstance(coordinate, bool) and -180 <= coordinate <= 180:
                normalized[name] = float(coordinate)
        vehicle = slots.get("vehicle_type")
        if vehicle in {"BIKE", "CAR_4", "CAR_7"}:
            normalized["vehicle_type"] = vehicle
        passenger_count = slots.get("passenger_count")
        if isinstance(passenger_count, int) and not isinstance(passenger_count, bool) and 1 <= passenger_count <= 20:
            normalized["passenger_count"] = passenger_count
        text_slot("promo_code", 50)
    elif domain == "restaurant":
        text_slot("location", 300)
        text_slot("cuisine_type", 200)
        text_slot("cuisine_query", 200)
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
            "morning",
            "afternoon",
            "evening",
            "tomorrow_morning",
            "tomorrow_afternoon",
            "tomorrow_evening",
        }:
            normalized["time_preference"] = preference
        selection = slots.get("selection")
        if selection in {"first", "second", "third", "fourth", "fifth"}:
            normalized["selection"] = selection
        selection_index = slots.get("selection_index")
        if isinstance(selection_index, int) and not isinstance(selection_index, bool) and 0 <= selection_index <= 99:
            normalized["selection_index"] = selection_index
    elif domain == "food":
        for name, limit in (
            ("query", 300),
            ("dish_query", 300),
            ("location", 300),
            ("district", 120),
            ("category", 120),
            ("delivery_preference", 80),
            ("address_reference", 200),
        ):
            text_slot(name, limit)
        max_price = slots.get("max_price")
        if isinstance(max_price, int) and not isinstance(max_price, bool) and 0 <= max_price <= 10_000_000:
            normalized["max_price"] = max_price
    return normalized


def _sanitize_plan(plan: AssistantPlan) -> AssistantPlan:
    tasks: list[PlannedTask] = []
    for index, task in enumerate(plan.tasks[:4]):
        dependencies = sorted({value for value in task.depends_on if 0 <= value < index})
        slots = _domain_slots(task.domain, _canonical_model_slots(task.extracted_slots))
        tasks.append(task.model_copy(update={"extracted_slots": slots, "depends_on": dependencies}))
    clarification = plan.clarification_question if plan.needs_clarification else None
    if clarification and len(clarification) > 500:
        clarification = clarification[:500]
    discarded_task_refs = sorted(
        {
            value
            for value in plan.discarded_task_refs
            if isinstance(value, int) and not isinstance(value, bool) and 0 <= value < 8
        }
    )
    return plan.model_copy(
        update={
            "tasks": tasks,
            "clarification_question": clarification,
            "discarded_task_refs": discarded_task_refs,
        }
    )


def _merge_explicit_context_actions(
    plan: AssistantPlan,
    message: str,
    conversation_state: dict[str, Any] | None,
) -> AssistantPlan:
    raw_tasks = (
        conversation_state.get("tasks", [])
        if isinstance(conversation_state, dict) and isinstance(conversation_state.get("tasks", []), list)
        else []
    )
    deterministic_refs = _discard_targets(message, raw_tasks)
    allowed_model_refs = {
        index
        for index, value in enumerate(raw_tasks[:8])
        if isinstance(value, dict)
        and str(value.get("phase", "PLANNING")) not in {"COMPLETED", "FAILED", "BLOCKED", "DISCARDED"}
    }
    discarded_refs = sorted((set(plan.discarded_task_refs).intersection(allowed_model_refs)).union(deterministic_refs))
    explicit_stopover = _stopover_address(message)
    active_ride = next(
        (
            value for value in raw_tasks[:8]
            if isinstance(value, dict)
            and str(value.get("domain", "")) == "ride"
            and str(value.get("phase", "PLANNING")) not in {"COMPLETED", "FAILED", "BLOCKED", "DISCARDED"}
        ),
        None,
    )
    if explicit_stopover and active_ride:
        # A stopover sentence is a material edit to the active Ride route,
        # even when a provider latches onto a nearby anchor noun such as
        # “quán” and returns a new Restaurant task. Preserve the active route
        # slots and let Gateway resolve the authoritative destination again.
        active_slots = _domain_slots("ride", active_ride.get("extracted_slots", {}))
        active_slots["stopover_address"] = explicit_stopover
        model_ride = next((task for task in plan.tasks if task.domain == "ride"), None)
        if model_ride is None:
            goal = str(active_ride.get("goal") or "Cập nhật chuyến xe").strip()[:500]
            normalized_request = str(active_ride.get("goal") or "Cập nhật chuyến xe với điểm dừng").strip()[:2000]
            model_ride = PlannedTask(
                domain="ride",
                goal=goal or "Cập nhật chuyến xe",
                normalized_request=normalized_request or "Cập nhật chuyến xe với điểm dừng",
                extracted_slots=active_slots,
            )
        else:
            model_ride = model_ride.model_copy(update={"extracted_slots": active_slots, "depends_on": []})
        return plan.model_copy(
            update={
                "tasks": [model_ride],
                "interaction_mode": "service",
                "needs_clarification": False,
                "clarification_question": None,
            }
        )
    # Retain unfinished anchor tasks when a follow-up turn only adds travel
    # details. The planner may omit them due to recency bias, but Gateway
    # needs the original healthcare/restaurant task to remain addressable.
    if not discarded_refs and raw_tasks:
        active_anchors = [
            value for value in raw_tasks[:8]
            if isinstance(value, dict)
            and str(value.get("phase", "PLANNING")) in {"PLANNING", "NEEDS_INFO", "IN_PROGRESS"}
            and str(value.get("domain", "")) in {"healthcare", "restaurant"}
        ]
        has_ride = any(task.domain == "ride" for task in plan.tasks)
        retained_domains = {task.domain for task in plan.tasks}
        if has_ride and active_anchors:
            missing_anchor_domains = {
                str(value.get("domain")) for value in active_anchors
                if str(value.get("domain")) not in retained_domains
            }
            if len(missing_anchor_domains) > 1:
                question = "Bạn muốn chuyến xe này gắn với lịch khám hay nhà hàng đang chuẩn bị?"
                return AssistantPlan(
                    assistant_message=question,
                    interaction_mode="advisory",
                    tasks=[],
                    needs_clarification=True,
                    clarification_question=question,
                )
            retained: list[PlannedTask] = []
            for value in active_anchors:
                domain = str(value.get("domain"))
                if domain in retained_domains:
                    continue
                slots = value.get("extracted_slots") if isinstance(value.get("extracted_slots"), dict) else {}
                retained_task = _task(
                        domain,
                        str(value.get("goal") or message),
                        str(value.get("goal") or "Tiếp tục yêu cầu đang dang dở"),
                        dict(slots),
                    )
                if isinstance(value.get("normalized_request"), str) and value["normalized_request"].strip():
                    retained_task = retained_task.model_copy(update={"normalized_request": value["normalized_request"][:2000]})
                retained.append(retained_task)
            if retained:
                retained_count = len(retained)
                if retained_count + len(plan.tasks) > 4:
                    question = "Mình đang giữ các yêu cầu chính của bạn. Bạn muốn hoàn tất yêu cầu neo trước hay chọn phương án di chuyển trước?"
                    return AssistantPlan(
                        assistant_message=question,
                        interaction_mode="advisory",
                        tasks=[],
                        needs_clarification=True,
                        clarification_question=question,
                    )
                shifted: list[PlannedTask] = []
                for task in plan.tasks:
                    dependencies = [value + retained_count for value in task.depends_on]
                    if task.domain == "ride":
                        dependencies = sorted(set(dependencies).union(range(retained_count)))
                    shifted.append(task.model_copy(update={"depends_on": dependencies}))
                plan = plan.model_copy(update={"tasks": [*retained, *shifted]})
    interaction_mode = plan.interaction_mode
    if plan.tasks:
        interaction_mode = "service"
    elif interaction_mode == "service":
        conversation_plan = _conversation_only_plan(message, _plain(message))
        if conversation_plan is not None:
            interaction_mode = conversation_plan.interaction_mode
    return plan.model_copy(
        update={
            "discarded_task_refs": discarded_refs,
            "interaction_mode": interaction_mode,
        }
    )


def _merge_explicit_semantics(plan: AssistantPlan, message: str) -> AssistantPlan:
    """Keep explicit user slots when a model response omits or misclassifies direct vehicle/time tokens."""
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


def _fresh_current_location(value: Any, now: datetime | None = None) -> dict[str, Any] | None:
    if not isinstance(value, dict) or value.get("source") != "device":
        return None
    latitude = value.get("latitude")
    longitude = value.get("longitude")
    captured_at = value.get("captured_at")
    if (
        not isinstance(latitude, int | float)
        or isinstance(latitude, bool)
        or not -90 <= latitude <= 90
        or not isinstance(longitude, int | float)
        or isinstance(longitude, bool)
        or not -180 <= longitude <= 180
        or not isinstance(captured_at, str)
    ):
        return None
    try:
        captured = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    if captured.tzinfo is None or captured.utcoffset() is None:
        return None
    age_seconds = ((now or _now()) - captured.astimezone(TemporalContext.timezone)).total_seconds()
    if age_seconds < -300 or age_seconds > 900:
        return None
    address_text = value.get("address_text")
    return {
        "latitude": float(latitude),
        "longitude": float(longitude),
        "address_text": address_text.strip()[:300] if isinstance(address_text, str) and address_text.strip() else "Vị trí hiện tại",
    }


def _apply_context_precedence(
    plan: AssistantPlan,
    message: str,
    conversation_state: dict[str, Any] | None,
    current_location: dict[str, Any] | None,
) -> AssistantPlan:
    """Fill missing semantic slots without overriding the current turn."""
    state = conversation_state if isinstance(conversation_state, dict) else {}
    raw_addresses = state.get("saved_addresses", [])
    saved_addresses = [item for item in raw_addresses if isinstance(item, dict)] if isinstance(raw_addresses, list) else []
    lowered = _plain(message)
    fresh_location = _fresh_current_location(current_location)
    tasks: list[PlannedTask] = []
    for task in plan.tasks:
        slots = dict(task.extracted_slots)
        matched_address: dict[str, Any] | None = None
        for address in saved_addresses:
            label = address.get("label")
            if not isinstance(label, str) or not label.strip():
                continue
            label_plain = _plain(label).strip()
            if label_plain and (label_plain in lowered or (label_plain == "nha" and "home" in lowered)):
                matched_address = address
                break
        if task.domain == "ride":
            for prefix in ("pickup", "dropoff"):
                slot_name = f"{prefix}_address"
                current_value = slots.get(slot_name)
                selected = matched_address if isinstance(current_value, str) and matched_address else None
                if selected and _plain(str(current_value)).strip() not in {_plain(str(selected.get("label", ""))).strip(), "home", "nha"}:
                    selected = None
                if selected and isinstance(selected.get("address_text"), str):
                    slots[slot_name] = selected["address_text"]
                    if isinstance(selected.get("latitude"), int | float):
                        slots[f"{prefix}_latitude"] = float(selected["latitude"])
                    if isinstance(selected.get("longitude"), int | float):
                        slots[f"{prefix}_longitude"] = float(selected["longitude"])
            if not slots.get("pickup_address") and fresh_location:
                slots["pickup_address"] = fresh_location["address_text"]
                slots["pickup_latitude"] = fresh_location["latitude"]
                slots["pickup_longitude"] = fresh_location["longitude"]
        elif task.domain == "food":
            if matched_address and isinstance(matched_address.get("address_text"), str):
                if not slots.get("location") or _plain(str(slots.get("location"))).strip() in {"home", "nha"}:
                    slots["location"] = matched_address["address_text"]
            elif not slots.get("location") and fresh_location:
                slots["location"] = fresh_location["address_text"]
        elif task.domain == "restaurant" and not slots.get("location") and fresh_location:
            slots["location"] = fresh_location["address_text"]
        tasks.append(task.model_copy(update={"extracted_slots": slots}))
    return plan.model_copy(update={"tasks": tasks})


def _enforce_reference_dependencies(plan: AssistantPlan, message: str) -> AssistantPlan:
    """Make the high-risk semantic reference boundary deterministic.

    A model may understand "đó" correctly but must not turn it into a
    destination. When the user asks for a dependent Ride after Healthcare or
    Restaurant, Gateway will resolve the address from the domain result.
    """
    lowered = _plain(message)
    reference = _has_any(
        lowered, ("nha hang do", "toi do", "dua toi toi do", "den do", "sau do", "roi dat xe", "sau do dat xe")
    )
    if not reference:
        return plan

    tasks: list[PlannedTask] = []
    for index, task in enumerate(plan.tasks):
        if task.domain != "ride":
            tasks.append(task)
            continue
        dependencies = list(task.depends_on)
        prior = [
            candidate_index
            for candidate_index, candidate in enumerate(plan.tasks[:index])
            if candidate.domain in {"healthcare", "restaurant"}
        ]
        if prior:
            dependencies = sorted(set(dependencies).union(prior))
        slots = dict(task.extracted_slots)
        if prior:
            slots.pop("dropoff_address", None)
        tasks.append(task.model_copy(update={"depends_on": dependencies, "extracted_slots": slots}))
    return plan.model_copy(update={"tasks": tasks})


def _requires_route_advisory(message: str, plan: AssistantPlan) -> bool:
    """Detect route choices that need user selection before task fan-out."""
    lowered = _plain(message)
    multi_pickup = sum(
        marker in lowered
        for marker in ("don tai", "don o", "don tung nguoi", "bon noi", "ba noi", "nhieu diem")
    ) >= 2
    group_match = re.search(r"\b([3-9]|[1-9][0-9])\s*nguoi\b", lowered)
    group_trip = bool(group_match) and any(token in lowered for token in ("di an", "di cung", "di nha hang", "goi xe"))
    multi_leg = sum(task.domain == "ride" for task in plan.tasks) > 1
    return bool((multi_pickup or group_trip or multi_leg) and len(plan.tasks) >= 1)


def _apply_plan_guards(
    plan: AssistantPlan,
    message: str,
    conversation_state: dict[str, Any] | None,
    current_location: dict[str, Any] | None = None,
) -> AssistantPlan:
    """Apply deterministic safety and planning rules to every planner path."""
    plan = _merge_explicit_context_actions(plan, message, conversation_state)
    plan = _merge_explicit_semantics(plan, message)
    plan = _apply_context_precedence(plan, message, conversation_state, current_location)
    plan = _enforce_reference_dependencies(plan, message)
    if _requires_route_advisory(message, plan):
        question = "Bạn muốn đi 1 xe 7 chỗ đón theo tuyến hay nhiều xe riêng? Mình sẽ lập các chặng sau khi bạn chọn phương án."
        return AssistantPlan(
            assistant_message=question,
            interaction_mode="advisory",
            tasks=[],
            needs_clarification=True,
            clarification_question=question,
        )
    return _sanitize_plan(plan)


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
    for message in state.get("messages", [])[-20:]:
        if not isinstance(message, dict):
            continue
        role = message.get("role")
        content = _safe_model_text(message.get("content"), 1200)
        if role in {"user", "assistant"} and content:
            recent_messages.append({"role": role, "content": content})
    response_schema = AssistantPlan.model_json_schema()
    required = response_schema.setdefault("required", [])
    if "reasoning" in required:
        required.remove("reasoning")
    required.insert(0, "reasoning")
    payload = {
        "system_prompt": f"{STRUCTURED_CONVERSATION_RULES}\n\n{XONE_SYSTEM_PROMPT}",
        "current_time": _now().isoformat(),
        "timezone": TIMEZONE,
        "message": state.get("query", ""),
        "recent_messages": recent_messages,
        "conversation_state": _planner_safe_state(state.get("conversation_state", {})),
        "current_location": _fresh_current_location(state.get("current_location")),
        "user_profile": _safe_slots(state.get("user_profile", {})) if state.get("user_profile") else None,
        "response_schema": response_schema,
        "max_tasks": 4,
        "configured_model": settings.gemini_model,
    }
    return json.dumps(payload, ensure_ascii=False)


async def _invoke_structured(
    model: LLMAdapter,
    prompt: str,
    schema: type[BaseModel],
    *,
    purpose: Literal["plan", "compose"],
) -> BaseModel:
    settings = get_settings()
    telemetry = get_telemetry()
    started_at = perf_counter()
    observation_name = (
        "LLM: Phân tích & Lập kế hoạch" if purpose == "plan" else "LLM: Soạn câu trả lời"
    )
    prompt_name = "core_a_plan" if purpose == "plan" else "core_a_compose"
    with telemetry.observation(
        observation_name,
        "generation",
        SafeObservationMetadata(
            invocation="structured",
            response_schema=schema.__name__,
            prompt_template_name=prompt_name,
            prompt_template_version="1",
            status="started",
        ),
        input={"prompt": prompt, "purpose": purpose, "schema": schema.__name__, "prompt_length": len(prompt)},
        model=settings.gemini_model,
    ) as generation_observation:
        try:
            structured = getattr(model, "ainvoke_structured", None)
            raw = (
                await structured(prompt, schema)
                if callable(structured)
                else await model.ainvoke(prompt)
            )
            parsed = _parse_model(raw, schema)
            usage = extract_generation_usage(raw)
            _LAST_USAGE_VAR.set(usage)
            runtime = (
                llm_diagnostics(settings)
                if isinstance(model, GeminiAdapter)
                else {}
            )
            invocation = runtime.get("last_model_call_invocation")
            generation_observation.update(
                metadata=SafeObservationMetadata(
                    invocation=(
                        invocation if invocation in {"raw", "structured"} else "structured"
                    ),
                    response_schema=schema.__name__,
                    prompt_template_name=prompt_name,
                    prompt_template_version="1",
                    fallback_used=bool(runtime.get("fallback_used", False)),
                    structured_output_fallback_used=bool(
                        runtime.get("structured_output_fallback_used", False)
                    ),
                    retry_count=1 if runtime.get("fallback_model_attempted") else 0,
                    status="succeeded",
                    latency_ms=max(0, int((perf_counter() - started_at) * 1000)),
                ),
                output=parsed.model_dump(mode="json"),
                usage=usage,
                model=(
                    str(runtime.get("last_model_used"))
                    if runtime.get("last_model_used")
                    else settings.gemini_model
                ),
            )
            return parsed
        except Exception as error:
            _LAST_USAGE_VAR.set(None)
            generation_observation.update(
                metadata=SafeObservationMetadata(
                    invocation="structured",
                    response_schema=schema.__name__,
                    prompt_template_name=prompt_name,
                    prompt_template_version="1",
                    status="failed",
                    error_code=provider_error_category(error),
                    latency_ms=max(0, int((perf_counter() - started_at) * 1000)),
                ),
                output={"error": str(error)[:300]},
            )
            raise



def _deterministic_composition(
    tasks: list[dict[str, Any]],
    authoritative_results: list[dict[str, Any]],
) -> str:
    kinds = {
        str(item.get("kind"))
        for item in authoritative_results
        if isinstance(item, dict) and isinstance(item.get("kind"), str)
    }
    if kinds.intersection({"task_error", "ride_timing_conflict"}):
        return "Một bước chưa thể tiếp tục an toàn. Bạn xem lại thông tin mình vừa hiển thị rồi thử lại nhé."
    if kinds.intersection({"restaurant_confirmation", "healthcare_confirmation", "food_confirmation"}):
        return "Các chi tiết đã sẵn sàng để bạn kiểm tra. Khi thấy mọi thứ đúng ý, bạn xác nhận bước tiếp theo nhé."
    if kinds.intersection({"restaurant_options", "healthcare_options", "food_options", "ride_quote"}):
        return "Mình đã tìm được vài lựa chọn phù hợp từ dữ liệu hiện có. Bạn xem danh sách rồi chọn phương án hợp ý nhất nhé."
    if kinds.intersection({"reservation", "appointment_confirmed", "food_order"}):
        return "Mình đã cập nhật yêu cầu theo kết quả xác thực từ dịch vụ; các chi tiết mới nhất đang ở ngay bên dưới."
    if authoritative_results:
        return "Mình đã cập nhật thông tin mới nhất và sắp xếp bước tiếp theo để bạn dễ kiểm tra."
    if tasks:
        return "Mình đã ghi nhận việc bạn đang làm. Bạn cho mình thêm chi tiết còn thiếu để tiếp tục nhé."
    return "Mình vẫn ở đây. Bạn muốn cùng mình bắt đầu từ món ăn, chuyến xe, bàn ăn hay lịch khám?"


async def _compose_response(
    _message: str,
    tasks: list[dict[str, Any]],
    authoritative_results: list[dict[str, Any]],
    llm: LLMAdapter | None = None,
) -> tuple[str, str]:
    """Compose a warm, helpful explanation around authoritative values."""
    settings = get_settings()
    has_key = bool(getattr(settings, "has_gemini_api_key", settings.gemini_api_key))
    use_model = llm is not None or (settings.agent_model_mode == "gemini" and has_key)
    current_tasks = [
        task for task in tasks
        if isinstance(task, dict) and task.get("phase") not in {"FAILED", "DISCARDED", "COMPLETED"}
    ]
    fallback = _deterministic_composition(current_tasks, authoritative_results)
    if not use_model:
        return fallback, "deterministic"
    model = llm or GeminiAdapter()
    # Completed/failed/discarded tasks are historical state, not current work.
    # Keep them out of the model context so the composer cannot resurrect old
    # transactions in a new turn.
    safe_tasks = _planner_safe_state({"tasks": current_tasks}).get("tasks", [])
    safe_results = _bounded_authoritative_results(authoritative_results)
    prompt = json.dumps(
        {
            "system_prompt": f"{STRUCTURED_CONVERSATION_RULES}\n\n{XONE_SYSTEM_PROMPT}",
            "instruction": COMPOSE_INSTRUCTION,
            "legacy_instruction": COMPOSE_INSTRUCTION,
            "deprecated_instruction": (
                "Viết phản hồi tiếng Việt tự nhiên, thân thiện và chu đáo cho người dùng dựa trên danh sách tác vụ và kết quả thực tế từ hệ thống. "
                "Tuyệt đối không lặp lại các ID kỹ thuật ẩn, không tự bịa số liệu, giá tiền, trạng thái, tên hay địa chỉ. "
                "Không khẳng định đơn/lịch đã hoàn tất trừ khi kết quả ghi rõ hoàn thành. "
                "Tóm tắt các lựa chọn rõ ràng, dễ hiểu và hướng dẫn bước xác nhận tiếp theo một cách gần gũi."
            ),
            "tasks": safe_tasks[:4],
            "authoritative_results": safe_results,
            "response_schema": AssistantComposition.model_json_schema(),
        },
        ensure_ascii=False,
    )
    try:
        result = await _invoke_structured(
            model,
            prompt,
            AssistantComposition,
            purpose="compose",
        )
        MODEL_DIAGNOSTICS.update(
            {
                "last_model_call_at": _now().isoformat(),
                "last_model_call_status": "succeeded",
                "last_model_call_error": None,
            }
        )
        logger.info("assistant.composition.accepted model=%s", llm_diagnostics(settings)["last_model_used"])
        return _safe_composed_message(str(result.message), authoritative_results), "model"
    except Exception as error:  # provider errors are intentionally reduced to a safe fallback
        MODEL_DIAGNOSTICS.update(
            {
                "last_model_call_at": _now().isoformat(),
                "last_model_call_status": "failed",
                "last_model_call_error": type(error).__name__,
            }
        )
        logger.warning("Assistant composition unavailable; deterministic fallback: %s", type(error).__name__)
        return fallback, "deterministic"


async def compose_response(
    message: str,
    tasks: list[dict[str, Any]],
    authoritative_results: list[dict[str, Any]],
    llm: LLMAdapter | None = None,
) -> tuple[str, str]:
    """Trace only bounded composition metadata around the existing behavior."""

    settings = get_settings()
    telemetry = get_telemetry()
    started_at = perf_counter()
    has_key = bool(getattr(settings, "has_gemini_api_key", settings.gemini_api_key))
    model_expected = llm is not None or (settings.agent_model_mode == "gemini" and has_key)
    with telemetry.observation(
        "Response: Soạn thảo phản hồi",
        "chain",
        SafeObservationMetadata(
            task_count=min(len(tasks), 4),
            result_count=min(len(authoritative_results), 32),
            status="started",
        ),
        input={
            "message_length": len(message),
            "task_count": len(tasks),
            "authoritative_results_count": len(authoritative_results),
        },
    ) as composition_observation:
        response, source = await _compose_response(
            message,
            tasks,
            authoritative_results,
            llm=llm,
        )
        degraded = model_expected and source == "deterministic"
        composition_observation.update(
            metadata=SafeObservationMetadata(
                task_count=min(len(tasks), 4),
                result_count=min(len(authoritative_results), 32),
                decision_source=source,
                status="degraded" if degraded else "succeeded",
                error_code="composition_fallback" if degraded else None,
                latency_ms=max(0, int((perf_counter() - started_at) * 1000)),
            ),
            output={"assistant_message": response, "decision_source": source},
        )
        if degraded:
            with telemetry.observation(
                "fallback",
                "span",
                SafeObservationMetadata(
                    phase="compose",
                    error_code="composition_fallback",
                    status="degraded",
                ),
            ):
                pass
        return response, source



def build_assistant_graph(llm: LLMAdapter | None = None):
    settings = get_settings()
    model = llm or GeminiAdapter()
    has_key = bool(getattr(settings, "has_gemini_api_key", settings.gemini_api_key))
    use_model = llm is not None or (settings.agent_model_mode == "gemini" and has_key)

    async def decide(state: AssistantState) -> AssistantState:
        if state.get("mode", "plan") == "compose":
            message, source = await compose_response(
                str(state.get("query", "")),
                list(state.get("conversation_state", {}).get("tasks", [])),
                list(state.get("authoritative_results", [])),
                llm=model if use_model else None,
            )
            raw_usage = _LAST_USAGE_VAR.get()
            usage_dict = {
                "prompt_tokens": raw_usage.input_tokens or 0,
                "completion_tokens": raw_usage.output_tokens or 0,
                "total_tokens": raw_usage.total_tokens or 0,
            } if isinstance(raw_usage, GenerationUsage) and source == "model" else None
            return {
                "assistant_message": message,
                "decision_source": source,
                "usage": usage_dict,
                "model": llm_diagnostics(settings).get("last_model_used") or settings.gemini_model,
            }
        temporal_boundary = _temporal_boundary_plan(str(state.get("query", "")))
        if temporal_boundary is not None:
            return _typed_pipeline_result(temporal_boundary, state, "deterministic")
        if not use_model:
            plan = deterministic_plan(str(state.get("query", "")), state.get("conversation_state", {}))
            plan = _apply_plan_guards(
                plan,
                str(state.get("query", "")),
                state.get("conversation_state", {}),
                state.get("current_location"),
            )
            logger.info("assistant.model_decision.degraded reason=provider_not_configured tasks=%d", len(plan.tasks))
            if settings.agent_model_mode == "gemini":
                with get_telemetry().observation(
                    "fallback",
                    "span",
                    SafeObservationMetadata(
                        phase="plan",
                        error_code="provider_not_configured",
                        status="degraded",
                    ),
                ):
                    pass
            return _typed_pipeline_result(plan, state, "deterministic")
        try:
            message = str(state.get("query", ""))
            cancellation_boundary = _ride_cancellation_plan(message, state.get("conversation_state"))
            if cancellation_boundary is not None:
                return _typed_pipeline_result(cancellation_boundary, state, "deterministic")
            # Apply the same explicit out-of-scope boundary before invoking a
            # generative model; prompt-only enforcement is not sufficient.
            explicit_boundary = _conversation_only_plan(message, _plain(message))
            if explicit_boundary is not None:
                return _typed_pipeline_result(explicit_boundary, state, "deterministic")
            plan = _sanitize_plan(
                await _invoke_structured(
                    model,
                    _model_prompt(state),
                    AssistantPlan,
                    purpose="plan",
                )
            )
            plan = _apply_plan_guards(plan, message, state.get("conversation_state"), state.get("current_location"))
            MODEL_DIAGNOSTICS.update(
                {
                    "last_model_call_at": _now().isoformat(),
                    "last_model_call_status": "succeeded",
                    "last_model_call_error": None,
                }
            )
            runtime = llm_diagnostics(settings)
            logger.info(
                "assistant.model_decision.accepted model=%s tasks=%d", runtime["last_model_used"], len(plan.tasks)
            )
            raw_usage = _LAST_USAGE_VAR.get()
            usage_dict = {
                "prompt_tokens": raw_usage.input_tokens or 0,
                "completion_tokens": raw_usage.output_tokens or 0,
                "total_tokens": raw_usage.total_tokens or 0,
            } if isinstance(raw_usage, GenerationUsage) else None
            return {
                **_typed_pipeline_result(plan, state, "model"),
                "model": runtime["last_model_used"] or settings.gemini_model,
                "fallback_model": settings.gemini_fallback_model,
                "usage": usage_dict,
            }
        except Exception as error:  # validation/provider errors use the bounded semantic fallback
            MODEL_DIAGNOSTICS.update(
                {
                    "last_model_call_at": _now().isoformat(),
                    "last_model_call_status": "failed",
                    "last_model_call_error": type(error).__name__,
                }
            )
            logger.warning("Assistant planner unavailable; deterministic fallback: %s", type(error).__name__)
            with get_telemetry().observation(
                "fallback",
                "span",
                SafeObservationMetadata(
                    phase="plan",
                    error_code=provider_error_category(error),
                    status="degraded",
                ),
            ):
                pass
            plan = deterministic_plan(str(state.get("query", "")), state.get("conversation_state", {}))
            plan = _apply_plan_guards(
                plan,
                str(state.get("query", "")),
                state.get("conversation_state", {}),
                state.get("current_location"),
            )
            return _typed_pipeline_result(plan, state, "deterministic")

    graph = StateGraph(AssistantState)
    graph.add_node("decide", decide)
    graph.set_entry_point("decide")
    graph.add_edge("decide", END)
    return graph.compile()


assistant_agent = build_assistant_graph()
