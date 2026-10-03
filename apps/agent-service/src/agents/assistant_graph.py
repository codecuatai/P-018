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
- Resolve short replies using the active task and the last assistant question in the full conversation context. Set `dialogue_resolution.relation` to CONTINUE_PENDING only when the user is answering that pending step; use START_NEW for a clear new service request, UNRELATED for a separate conversational/profile question, and UNCLEAR when context does not establish the intent. `target_task_ref` must identify the matching active task_ref from conversation_state.tasks. If the user selects a saved address, set action=SELECT_SAVED_ADDRESS and return its exact label from saved_addresses in `saved_address_label`; never invent or paraphrase a label. If the user supplies a new concrete delivery address in the current message, set action=USE_EXPLICIT_ADDRESS and copy only the supplied text into `explicit_address_text`; do not infer an address from a generic reference. Set action=CONFIRM_FOOD_ORDER only when the current turn clearly authorizes placing the pending food order in response to a confirmation request; a generic acknowledgement is not consent when the prior question did not ask to place the order. Never authorize payment from chat text.
- For questions about the user's personal facts or preferences, use only matching fields in user_profile or retrieved_memories. If no matching fact is present, say clearly that you do not have that information and ask whether the user wants to share it; never guess or deflect to unrelated suggestions.
- When asked about your own age, home, relationships, or likes, be clear that you are an AI and do not have human life facts or personal preferences; do not invent a favorite color or food.
- When a question is clearly playful or hypothetical, do not trigger an out-of-scope refusal just because it mentions a specialized word. Keep the joke brief, mark fiction as playful, and distinguish it from factual claims.
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

Before building tasks, read user_profile, conversation_state.tasks, retrieved_memories, and recent_messages. Retrieved memories are contextual hints only: use them to resolve intent/preferences, never as authority for current prices, availability, orders, bookings, payments, or exact sensitive facts. Preserve COMPLETED tasks as history; only discard an in-progress task when the user explicitly abandons it. Map saved address references to an exact label from saved_addresses. For ambiguous or missing addresses, ask one clarification question or use location_query; never invent an exact address. Analyze intent, service count, dependencies, and required slots internally before emitting JSON. ride requires pickup_address and dropoff_address; food requires dish_query; restaurant requires location or cuisine_query; healthcare requires department. Maximum 4 tasks. Never claim success unless authoritative_results proves it.
Interpret the latest user message in its full conversational context. For a personal-data question, set dialogue_resolution.contextual_query=PROFILE and choose profile_field from the requested field; for a question about the user's current device location, use CURRENT_LOCATION. Keep these queries separate from service tasks. For a ride using device location, set extracted_slots.pickup_source=CURRENT_DEVICE_LOCATION; for an explicitly supplied pickup set USER_PROVIDED. For a destination referring to a selected restaurant, set destination_reference=RESTAURANT and omit dropoff_address. Set selection_index only when context identifies a specific displayed option; never assume the first option. Set explicit_confirmation=true only when the current message clearly authorizes the pending service action after a confirmation question; never treat a generic acknowledgment as consent and never authorize payment.
For restaurant discovery, retain the user's stated cuisine, area, and time as semantic slots; do not create a reservation until a concrete restaurant is selected and the required party size/time are available. For an unconfirmed Ride route change that adds an intermediate stop, use `operation=UPDATE` and `stopover_address`; retain the active ride task rather than creating an unrelated ride.
Food delivery and restaurant services are limited to central Hanoi (Hoàn Kiếm, Ba Đình, Đống Đa, Hai Bà Trưng, Tây Hồ, Cầu Giấy). For another city or district, return interaction_mode="unsupported" with a brief polite Vietnamese refusal. For nearby food, use the user's selected delivery address district; do not claim nearby results until the Food search tool returns authoritative items.
For harmless casual conversation, jokes, riddles, or simple general-knowledge questions, answer briefly in Vietnamese with tasks=[]. Do not claim personal experiences or invent live facts. If the user asks for specialized work outside X-One's services (such as writing/debugging code, solving homework, political analysis, medical diagnosis, or computer repair), return interaction_mode="unsupported" and a brief polite boundary. Never let this rule block a harmless question merely because it is unrelated to booking.
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


class PlannedTask(BaseModel):
    model_config = ConfigDict(extra="forbid")

    domain: Literal["ride", "food", "restaurant", "healthcare"]
    goal: str = Field(min_length=1, max_length=500)
    normalized_request: str = Field(min_length=1, max_length=2000)
    extracted_slots: dict[str, Any] = Field(default_factory=dict)
    depends_on: list[int] = Field(default_factory=list, max_length=4)
    needs_clarification: bool = False
    missing_information: list[str] = Field(default_factory=list, max_length=8)


class DialogueResolution(BaseModel):
    """Semantic routing for short replies in the context of an active workflow."""

    model_config = ConfigDict(extra="forbid")

    relation: Literal["CONTINUE_PENDING", "START_NEW", "UNRELATED", "UNCLEAR"] = "UNCLEAR"
    target_task_ref: int | None = Field(default=None, ge=0, le=7)
    saved_address_label: str | None = Field(default=None, max_length=120)
    action: Literal["NONE", "SELECT_SAVED_ADDRESS", "USE_EXPLICIT_ADDRESS", "CONFIRM_FOOD_ORDER"] = "NONE"
    explicit_address_text: str | None = Field(default=None, max_length=500)
    contextual_query: Literal["NONE", "PROFILE", "CURRENT_LOCATION"] = "NONE"
    profile_field: Literal["ALL", "NAME", "EMAIL", "PHONE", "ADDRESSES", "UNAVAILABLE"] | None = None
    explicit_confirmation: bool = False


class AssistantPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reasoning: str = Field(default="", max_length=800, description="Internal intent, slot, and dependency analysis; never display to the user.")
    assistant_message: str = Field(default="Mình sẽ giúp bạn xử lý yêu cầu này.", max_length=1000)
    tasks: list[PlannedTask] = Field(default_factory=list, max_length=4)
    dialogue_resolution: DialogueResolution = Field(
        default_factory=DialogueResolution,
        description="Contextual interpretation of the current turn against an active workflow.",
    )
    interaction_mode: Literal["service", "chitchat", "advisory", "unsupported"] = "service"
    discarded_task_refs: list[int] = Field(default_factory=list, max_length=8)
    needs_clarification: bool = False
    clarification_question: str | None = Field(default=None, max_length=500)


class AssistantComposition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=1200)
    claims_completion: bool = Field(
        default=False,
        description="True only if the message asserts that a service transaction has been completed.",
    )


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
    fresh_current_location = _fresh_current_location(state.get("current_location")) or {}
    semantic_turn = semantic_turn_from_plan(
        plan.tasks,
        interaction_mode=plan.interaction_mode,
        discarded_task_refs=plan.discarded_task_refs,
        conversation_state=(state.get("conversation_state", {}) if isinstance(state.get("conversation_state"), dict) else {}),
        current_location=fresh_current_location,
        explicit_confirmation=plan.dialogue_resolution.explicit_confirmation,
    )
    raw_context = state.get("conversation_state", {})
    context_tasks: list[PlannerTaskContext] = []
    raw_tasks: list[Any] = []
    if isinstance(raw_context, dict):
        for key in ("tasks", "completed_tasks"):
            values = raw_context.get(key, [])
            if isinstance(values, list):
                raw_tasks.extend(values)
    for index, raw in enumerate(raw_tasks):
        if len(context_tasks) >= 8:
            break
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
    *,
    degraded: bool = False,
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
                status="degraded" if degraded else "succeeded",
            ),
            output=format_human_plan_output(decision, plan.assistant_message),
        )
        for task in decision.tasks:
            steps = task.steps
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
                },
                output={
                    "disposition": task.disposition,
                    "step_count": len(steps),
                },
            ):
                pass
    return {
        "plan": plan.model_dump(),
        "semantic_turn": input_.semantic_turn.model_dump(mode="json"),
        "planning_decision": decision.model_dump(mode="json"),
        "assistant_message": plan.assistant_message,
        "decision_source": source,
        "degraded": degraded,
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


def _safe_model_facts(value: Any) -> list[dict[str, Any]]:
    """Expose authority presence/version without technical identifiers."""
    if not isinstance(value, list):
        return []
    facts: list[dict[str, Any]] = []
    for raw in value[:32]:
        if not isinstance(raw, dict):
            continue
        field = raw.get("field")
        fact_type = raw.get("fact_type")
        if not isinstance(field, str) or not field.strip() or not isinstance(fact_type, str):
            continue
        fact: dict[str, Any] = {
            "fact_type": fact_type[:80],
            "field": field[:120],
            "value": "present",
        }
        source_task_ref = raw.get("source_task_ref")
        if isinstance(source_task_ref, int) and source_task_ref >= 0:
            fact["source_task_ref"] = source_task_ref
        resource_version = raw.get("resource_version")
        if isinstance(resource_version, str | int) and not isinstance(resource_version, bool):
            fact["resource_version"] = resource_version
        expires_at = raw.get("expires_at")
        if isinstance(expires_at, str) and expires_at.strip():
            fact["expires_at"] = expires_at[:80]
        facts.append(fact)
    return facts


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
        facts = _safe_model_facts(raw_task.get("facts"))
        if facts:
            safe_task["facts"] = facts
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
                    "restaurant_update",
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
    raw_completed = value.get("completed_tasks", [])
    if isinstance(raw_completed, list):
        completed_tasks: list[dict[str, Any]] = []
        for index, raw_task in enumerate(raw_completed[:8]):
            domain = str(raw_task.get("domain", "")) if isinstance(raw_task, dict) else ""
            if not isinstance(raw_task, dict) or domain not in SUPPORTED_DOMAINS:
                continue
            safe_task: dict[str, Any] = {
                "task_ref": raw_task.get("task_ref", index),
                "domain": domain,
                "phase": "COMPLETED",
                "completed": True,
                "goal": _safe_model_text(raw_task.get("goal"), 500),
                "extracted_slots": _domain_slots(domain, _canonical_model_slots(raw_task.get("extracted_slots"))),
            }
            facts = _safe_model_facts(raw_task.get("facts"))
            if facts:
                safe_task["facts"] = facts
            completed_tasks.append(safe_task)
        if completed_tasks:
            safe_state["completed_tasks"] = completed_tasks
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
        if slots.get("pickup_source") in {"CURRENT_DEVICE_LOCATION", "USER_PROVIDED"}:
            normalized["pickup_source"] = slots["pickup_source"]
        if slots.get("destination_reference") == "RESTAURANT":
            normalized["destination_reference"] = "RESTAURANT"
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
    conversation_state: dict[str, Any] | None,
    current_location: dict[str, Any] | None,
) -> AssistantPlan:
    """Fill missing semantic slots without overriding the current turn."""
    state = conversation_state if isinstance(conversation_state, dict) else {}
    raw_addresses = state.get("saved_addresses", [])
    saved_addresses = [item for item in raw_addresses if isinstance(item, dict)] if isinstance(raw_addresses, list) else []
    fresh_location = _fresh_current_location(current_location)
    tasks: list[PlannedTask] = []
    for task in plan.tasks:
        slots = dict(task.extracted_slots)
        address_slots = [slots.get("pickup_address"), slots.get("dropoff_address"), slots.get("address_reference"), slots.get("location")]
        slot_labels = {_plain(value).strip() for value in address_slots if isinstance(value, str) and value.strip()}
        matched_address = next((address for address in saved_addresses
            if isinstance(address.get("label"), str) and _plain(str(address["label"])).strip() in slot_labels), None)
        if task.domain == "ride":
            for prefix in ("pickup", "dropoff"):
                slot_name = f"{prefix}_address"
                current_value = slots.get(slot_name)
                selected = matched_address if isinstance(current_value, str) and matched_address else None
                if selected and _plain(str(current_value)).strip() != _plain(str(selected.get("label", ""))).strip():
                    selected = None
                if selected and isinstance(selected.get("address_text"), str):
                    slots[slot_name] = selected["address_text"]
                    if isinstance(selected.get("latitude"), int | float):
                        slots[f"{prefix}_latitude"] = float(selected["latitude"])
                    if isinstance(selected.get("longitude"), int | float):
                        slots[f"{prefix}_longitude"] = float(selected["longitude"])
            if slots.get("pickup_source") == "CURRENT_DEVICE_LOCATION" and fresh_location:
                slots["pickup_address"] = fresh_location["address_text"]
                slots["pickup_latitude"] = fresh_location["latitude"]
                slots["pickup_longitude"] = fresh_location["longitude"]
        elif task.domain == "food":
            if matched_address and isinstance(matched_address.get("address_text"), str):
                slots["location"] = matched_address["address_text"]
        tasks.append(task.model_copy(update={"extracted_slots": slots}))
    return plan.model_copy(update={"tasks": tasks})


def _enforce_reference_dependencies(plan: AssistantPlan) -> AssistantPlan:
    """Make the high-risk semantic reference boundary deterministic.

    A model may understand "đó" correctly but must not turn it into a
    destination. When the user asks for a dependent Ride after Healthcare or
    Restaurant, Gateway will resolve the address from the domain result.
    """
    tasks: list[PlannedTask] = []
    for index, task in enumerate(plan.tasks):
        if task.domain != "ride" or task.extracted_slots.get("destination_reference") != "RESTAURANT":
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


def _apply_plan_guards(
    plan: AssistantPlan,
    conversation_state: dict[str, Any] | None,
    current_location: dict[str, Any] | None = None,
) -> AssistantPlan:
    """Validate model-selected semantics without reparsing user language."""
    normalized = _sanitize_plan(plan)
    normalized = _apply_context_precedence(normalized, conversation_state, current_location)
    return _enforce_reference_dependencies(normalized)


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
        input={"purpose": purpose, "schema": schema.__name__, "prompt_length": len(prompt)},
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
                output={"parsed": True, "schema": schema.__name__},
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
                output={"error_type": type(error).__name__},
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
        has_active_tasks = bool(current_tasks)
        has_authoritative_completion = any(
            isinstance(item, dict) and item.get("kind") in _CONFIRMED_RESULT_KINDS
            for item in authoritative_results
        )
        if result.claims_completion and has_active_tasks and not has_authoritative_completion:
            return fallback, "model_guarded"
        return str(result.message), "model"
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
            output={"message_length": len(response), "decision_source": source},
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
        if not use_model:
            plan = deterministic_plan(
                str(state.get("query", "")),
                state.get("conversation_state", {}),
                state.get("current_location"),
            )
            plan = _apply_plan_guards(
                plan,
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
            return _typed_pipeline_result(plan, state, "deterministic", degraded=True)
        try:
            plan = _sanitize_plan(
                await _invoke_structured(
                    model,
                    _model_prompt(state),
                    AssistantPlan,
                    purpose="plan",
                )
            )
            plan = _apply_plan_guards(plan, state.get("conversation_state"), state.get("current_location"))
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
            plan = deterministic_plan(
                str(state.get("query", "")),
                state.get("conversation_state", {}),
                state.get("current_location"),
            )
            plan = _apply_plan_guards(
                plan,
                state.get("conversation_state", {}),
                state.get("current_location"),
            )
            return _typed_pipeline_result(plan, state, "deterministic", degraded=True)

    graph = StateGraph(AssistantState)
    graph.add_node("decide", decide)
    graph.set_entry_point("decide")
    graph.add_edge("decide", END)
    return graph.compile()


assistant_agent = build_assistant_graph()
