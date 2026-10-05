from __future__ import annotations

import re
from typing import Any, Literal

from langgraph.graph import END, StateGraph
from pydantic import BaseModel, ConfigDict, Field

from src.agents.confirmation import is_explicit_confirmation
from src.agents.intent import extract_slots
from src.agents.policies.healthcare_policy import validate_tool_request
from src.agents.state import AgentState
from src.agents.tool_ids import make_tool_call_id
from src.config import get_settings
from src.models.schemas import ToolRequest
from src.services.llm import GeminiAdapter


class HealthcareSlotPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    department: str | None = None
    provider: Literal["longchau", "pharmacity"] | None = None
    medication_name: str | None = Field(default=None, max_length=120)
    symptoms: str | None = Field(default=None, max_length=1000)


class HealthcareResolution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intent: Literal["healthcare", "other"]
    action: Literal[
        "browse_departments", "browse_slots", "hold_slot", "confirm_appointment", "cancel_appointment", "none"
    ] = "none"
    slot_patch: HealthcareSlotPatch = Field(default_factory=HealthcareSlotPatch)
    explicit_confirmation: bool = False
    # Zero-based position in an authoritative list supplied with the prompt.
    selected_index: int | None = Field(default=None, ge=0, le=100)


def _slots_from_context(context: dict[str, Any], patch: HealthcareSlotPatch) -> dict[str, Any]:
    previous = context.get("slots", {})
    slots = dict(previous) if isinstance(previous, dict) else {}
    # IDs and patient identity are accepted only from trusted workflow/service state.
    for key in ("patient_id", "appointment_id", "slot_id"):
        if context.get(key) is not None:
            slots[key] = context[key]
    for key, value in patch.model_dump(exclude_none=True).items():
        slots[key] = value
    return {key: value for key, value in slots.items() if value not in (None, "")}


def _tool_request(
    tool_name: str,
    risk_level: str,
    arguments: dict[str, Any],
    workflow_id: str,
    turn_id: str,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    request = ToolRequest(
        tool_name=tool_name,
        risk_level=risk_level,  # type: ignore[arg-type]
        arguments=arguments,
        workflow_id=workflow_id,
        tool_call_id=make_tool_call_id(workflow_id, turn_id),
        idempotency_key=idempotency_key,
    )
    return validate_tool_request(request).model_dump()


def _tool_outcome(tool_name: str | None, result: Any) -> str:
    if isinstance(result, dict) and result.get("error"):
        return str(result["error"])
    if isinstance(result, list) and not result:
        return "EMPTY_RESULT"
    return "SUCCEEDED"


async def classify_and_extract(state: AgentState) -> dict[str, Any]:
    query = str(state.get("query", ""))
    context = dict(state.get("context", {}))
    tool_result = context.get("tool_result")
    workflow_id = str(state["workflow_id"])
    turn_id = str(state.get("turn_id", "1"))

    try:
        settings = get_settings()
        if settings.agent_model_mode != "gemini":
            folded = query.lower().replace("đ", "d")
            normalized = extract_slots(query)
            prior = context.get("slots", {})
            prior = dict(prior) if isinstance(prior, dict) else {}
            appointment_match = re.search(r"\bappointment\s+(\d+)\b|\blic hen\s+(\d+)\b", folded)
            action: Literal[
                "browse_departments", "browse_slots", "hold_slot", "confirm_appointment", "cancel_appointment", "none"
            ] = "none"
            if "huy" in folded and appointment_match:
                action = "cancel_appointment"
                prior["appointment_id"] = int(next(value for value in appointment_match.groups() if value))
            elif context.get("tool_name") == "healthcare.hold_slot":
                action = "confirm_appointment"
                result_data = tool_result.get("data", tool_result) if isinstance(tool_result, dict) else {}
                if isinstance(result_data, dict) and result_data.get("appointment_id") is not None:
                    prior["appointment_id"] = result_data["appointment_id"]
            elif context.get("tool_name") == "healthcare.list_slots":
                slot_match = re.search(r"\bslot\s+(\d+)\b", folded)
                if slot_match and isinstance(tool_result, list):
                    for item in tool_result:
                        nested = item.get("available_slots", []) if isinstance(item, dict) else []
                        match = next((slot for slot in nested if str(slot.get("id")) == slot_match.group(1)), None)
                        if match:
                            prior["slot_id"] = match["id"]
                            break
                action = "hold_slot" if is_explicit_confirmation(query) else "none"
            elif normalized.get("department"):
                action = "browse_slots"
            resolution = HealthcareResolution(
                intent="healthcare"
                if action != "none"
                or state.get("intent") == "healthcare_booking"
                or context.get("tool_name", "").startswith("healthcare.")
                or normalized.get("department")
                else "other",
                action=action,
                slot_patch={
                    **({"department": normalized["department"]} if normalized.get("department") else {}),
                    **({"medication_name": normalized["medication_name"]} if normalized.get("medication_name") else {}),
                },
                explicit_confirmation=is_explicit_confirmation(query),
            )
            context["slots"] = prior
        else:
            prompt = (
                "You interpret a healthcare/pharmacy workflow turn using conversation state and the latest message. "
                "Classify intent from meaning, including short follow-ups and references to prior choices. Return semantic "
                "slot values only; never invent IDs, medical facts, availability, diagnoses, or tool results. Use IDs only "
                "when explicitly present in the user's message; trusted existing state is included separately. Select a list "
                "item only by its zero-based index when the user clearly refers to that item. Set explicit_confirmation "
                "true only when the user clearly approves the pending action; questions, uncertainty, negation, or changes "
                "must be false. Do not diagnose or recommend treatment.\n"
                f"Workflow context: {context}\nAuthoritative latest tool result: {tool_result}\nLatest user message: {query}"
            )
            raw = await GeminiAdapter().ainvoke_structured(prompt, HealthcareResolution)
            if isinstance(raw, dict) and raw.get("parsed") is not None:
                raw = raw["parsed"]
            resolution = raw if isinstance(raw, HealthcareResolution) else HealthcareResolution.model_validate(raw)
    except Exception:
        return {
            "intent": "healthcare_booking" if context.get("intent") == "healthcare_booking" else "general_chat",
            "slots": context.get("slots", {}),
            "status": "NEEDS_INPUT",
            "missing_slots": ["request_clarification"],
        }

    if resolution.intent == "other":
        return {"intent": "general_chat", "slots": context.get("slots", {}), "status": "COMPLETED"}

    slots = _slots_from_context(context, resolution.slot_patch)
    action = resolution.action
    if context.get("tool_result_only") and tool_result is not None:
        tool_name = context.get("tool_name")
        if tool_name == "healthcare.list_departments" and isinstance(tool_result, list):
            index = resolution.selected_index
            if index is not None and index < len(tool_result) and isinstance(tool_result[index], dict):
                department = tool_result[index].get("name")
                if department:
                    slots["department"] = str(department)
                    return {
                        "intent": "healthcare_booking", "slots": slots, "status": "TOOL_REQUEST_READY",
                        "tool_request": _tool_request(
                            "healthcare.list_slots", "READ", {"department": slots["department"]}, workflow_id, turn_id
                        ),
                    }
        return {
            "intent": "healthcare_booking", "slots": slots, "status": "COMPLETED",
            "outcome": _tool_outcome(tool_name, tool_result),
        }

    if tool_result is not None and context.get("tool_name") == "healthcare.list_slots":
        data = tool_result.get("data", tool_result) if isinstance(tool_result, dict) else tool_result
        candidates = data if isinstance(data, list) else (
            data.get("available_slots", data.get("slots", [])) if isinstance(data, dict) else []
        )
        index = resolution.selected_index
        if isinstance(candidates, list) and index is not None and index < len(candidates):
            candidate = candidates[index]
            if isinstance(candidate, dict) and candidate.get("id") is not None:
                slots["slot_id"] = candidate["id"]

    if action == "cancel_appointment":
        if not slots.get("appointment_id"):
            return {"intent": "healthcare_booking", "slots": slots, "missing_slots": ["appointment_id"], "status": "NEEDS_INPUT"}
        return {
            "intent": "healthcare_booking", "slots": slots, "status": "TOOL_REQUEST_READY",
            "tool_request": _tool_request(
                "healthcare.cancel_appointment", "REVERSIBLE_WRITE",
                {"appointment_id": int(slots["appointment_id"])}, workflow_id, turn_id,
                f"healthcare-cancel-{workflow_id}-{turn_id}",
            ),
        }

    if action == "confirm_appointment":
        if not slots.get("appointment_id"):
            return {"intent": "healthcare_booking", "slots": slots, "missing_slots": ["appointment_id"], "status": "NEEDS_INPUT"}
        if not resolution.explicit_confirmation:
            return {"intent": "healthcare_booking", "slots": slots, "missing_slots": ["confirmation"], "status": "NEEDS_INPUT"}
        return {
            "intent": "healthcare_booking", "slots": slots, "status": "TOOL_REQUEST_READY",
            "tool_request": _tool_request(
                "healthcare.confirm_appointment", "FINANCIAL_OR_FINAL",
                {"appointment_id": int(slots["appointment_id"])}, workflow_id, turn_id,
                f"healthcare-confirm-{workflow_id}-{turn_id}",
            ),
        }

    if action == "browse_departments" or not slots.get("department"):
        return {
            "intent": "healthcare_booking", "slots": slots, "status": "TOOL_REQUEST_READY",
            "tool_request": _tool_request("healthcare.list_departments", "READ", {}, workflow_id, turn_id),
        }
    if action == "browse_slots" or not slots.get("slot_id"):
        return {
            "intent": "healthcare_booking", "slots": slots, "status": "TOOL_REQUEST_READY",
            "tool_request": _tool_request(
                "healthcare.list_slots", "READ", {"department": str(slots["department"])}, workflow_id, turn_id
            ),
        }
    if not slots.get("patient_id"):
        return {"intent": "healthcare_booking", "slots": slots, "missing_slots": ["patient_id"], "status": "NEEDS_INPUT"}
    if action != "hold_slot" or not resolution.explicit_confirmation:
        return {"intent": "healthcare_booking", "slots": slots, "missing_slots": ["confirmation"], "status": "NEEDS_INPUT"}

    return {
        "intent": "healthcare_booking", "slots": slots, "status": "TOOL_REQUEST_READY",
        "tool_request": _tool_request(
            "healthcare.hold_slot", "REVERSIBLE_WRITE",
            {
                "slot_id": int(slots["slot_id"]), "patient_id": int(slots["patient_id"]),
                "symptoms": str(resolution.slot_patch.symptoms or context.get("symptoms", "General consultation")),
            }, workflow_id, turn_id, f"healthcare-hold-{workflow_id}-{turn_id}",
        ),
    }


def compose_healthcare_response(state: AgentState) -> dict[str, Any]:
    phase = "PLANNING"
    outcome = "UNKNOWN"
    missing = []
    error_code = None
    if state.get("status") == "NEEDS_INPUT":
        phase = "NEEDS_INFO"
        missing = state.get("missing_slots", [])
    elif state.get("status") == "TOOL_REQUEST_READY":
        phase = "IN_PROGRESS"
    elif state.get("intent") == "general_chat":
        phase = "FAILED"
        error_code = "GENERAL_CHAT"
    else:
        phase = "COMPLETED"
        outcome = state.get("outcome", "SUCCEEDED")
    envelope = {
        "phase": phase, "outcome": outcome, "missing_information": missing, "error_code": error_code,
        "actions": [], "authoritative_cards": [],
    }
    response = "Mình đã cập nhật thông tin theo kết quả xác thực."
    if phase == "NEEDS_INFO":
        response = "Mình cần thêm thông tin cần thiết để tiếp tục xử lý yêu cầu của bạn."
    elif phase == "IN_PROGRESS":
        response = "Mình đang kiểm tra lựa chọn phù hợp dựa trên dữ liệu hiện có."
    elif phase == "FAILED":
        response = "Yêu cầu chưa thể hoàn tất an toàn với thông tin hiện tại."
    return {"response": response, "grounding_envelope": envelope, "tool_request": state.get("tool_request")}


def build_healthcare_graph():
    graph = StateGraph(AgentState)
    graph.add_node("classify_and_extract", classify_and_extract)
    graph.add_node("compose_response", compose_healthcare_response)
    graph.set_entry_point("classify_and_extract")
    graph.add_edge("classify_and_extract", "compose_response")
    graph.add_edge("compose_response", END)
    return graph.compile()


agent = build_healthcare_graph()
