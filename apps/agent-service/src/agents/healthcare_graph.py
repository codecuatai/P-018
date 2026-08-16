from __future__ import annotations

import re
import unicodedata
from typing import Any

from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field

from ..config import get_settings
from ..models.schemas import ToolRequest
from ..services.llm import GeminiAdapter
from .policies.healthcare_policy import validate_tool_request
from .state import AgentState
from .tool_ids import make_tool_call_id

DEPARTMENT_ALIASES = {
    "than kinh": "Than kinh",
    "tim mach": "Tim mach",
    "co xuong khop": "Co - Xuong - Khop",
    "tieu hoa": "Tieu hoa - Gan mat",
    "ho hap": "Ho hap",
    "tiet": "Tiet",
    "than tiet nieu": "Than - Tiet nieu",
    "mat": "Mat",
    "da lieu": "Da lieu",
    "nhi": "Nhi",
    "phu san": "Phu san",
    "tai mui hong": "Tai - Mui - Hong",
    "rang ham mat": "Rang - Ham - Mat",
    "kham benh": "Kham benh",
}

SYMPTOM_MARKERS = (
    "dau",
    "buon non",
    "non",
    "sot",
    "ho",
    "met",
    "chong mat",
    "tieu chay",
    "tao bon",
    "ngua",
    "phat ban",
)


class DepartmentSelection(BaseModel):
    department: str | None = None
    confidence: float = Field(default=0.0, ge=0, le=1)


def _fold(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value.lower())
    folded = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return folded.replace("đ", "d").replace("ð", "d")


def _healthcare_message(query: str, previous_intent: str | None) -> bool:
    folded = _fold(query)
    if previous_intent == "healthcare_booking":
        return True
    return any(term in folded for term in ("suc khoe", "bac si", "kham", "benh vien", "chuyen khoa", "dat lich y te", "huy lich", "huy cuoc hen", *SYMPTOM_MARKERS))


def _extract_slots(query: str, context: dict[str, Any], tool_result: Any) -> dict[str, Any]:
    previous_slots = context.get("slots", {})
    slots = dict(previous_slots) if isinstance(previous_slots, dict) else {}
    folded = _fold(query)

    for alias, value in DEPARTMENT_ALIASES.items():
        if alias in folded:
            slots["department"] = value
            break

    slot_match = re.search(r"(?:slot|khung\s*gio|khung)\s*(?:id\s*)?(?:la|:)?\s*(\d+)", folded)
    if slot_match:
        slots["slot_id"] = int(slot_match.group(1))
    appointment_match = re.search(r"(?:appointment|lich\s*hen|lich\s*kham)\s*(?:id\s*)?(?:la|:)?\s*(\d+)", folded)
    if appointment_match:
        slots["appointment_id"] = int(appointment_match.group(1))

    if context.get("patient_id") is not None:
        try:
            slots["patient_id"] = int(context["patient_id"])
        except (TypeError, ValueError):
            slots.pop("patient_id", None)
    if context.get("appointment_id") is not None:
        try:
            slots["appointment_id"] = int(context["appointment_id"])
        except (TypeError, ValueError):
            pass

    if isinstance(tool_result, list) and tool_result and isinstance(tool_result[0], dict):
        if "available_slots" in tool_result[0]:
            slots.setdefault("department", previous_slots.get("department") if isinstance(previous_slots, dict) else None)
    if isinstance(tool_result, dict):
        for key in ("appointment_id", "slot_id"):
            if tool_result.get(key) is not None:
                slots[key] = tool_result[key]
    return {key: value for key, value in slots.items() if value not in (None, "")}


def _is_confirmation(query: str) -> bool:
    folded = _fold(query).strip()
    return any(term in folded for term in ("xac nhan", "x ac nhan", "dong y", "dat lich", "giu khung", "giu slot", "tiep tuc", "ok", "duoc"))


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


def _tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", _fold(value))
        if len(token) > 2 and token not in {"khoa", "noi", "ngoai", "benh", "kham"}
    }


def _deterministic_department(query: str, departments: list[dict[str, Any]]) -> str | None:
    query_tokens = _tokens(query)
    if not query_tokens:
        return None
    scored: list[tuple[int, str]] = []
    for department in departments:
        name = str(department.get("name", ""))
        description = str(department.get("description", ""))
        score = len(query_tokens & _tokens(f"{name} {description}"))
        if score:
            scored.append((score, name))
    scored.sort(reverse=True)
    if not scored or (len(scored) > 1 and scored[0][0] == scored[1][0]):
        return None
    return scored[0][1]


async def _select_department(query: str, departments: list[dict[str, Any]]) -> str | None:
    if not departments:
        return None
    settings = get_settings()
    if settings.agent_model_mode == "gemini" and settings.gemini_api_key:
        try:
            prompt = (
                "Bạn hỗ trợ chọn chuyên khoa dựa trên mô tả dữ liệu được cung cấp. "
                "Chỉ chọn một tên khoa đúng y nguyên trong danh sách hoặc trả null. "
                "Không chẩn đoán bệnh và không đưa lời khuyên điều trị.\n"
                f"Triệu chứng người dùng: {query}\n"
                f"Danh sách chuyên khoa: {departments}"
            )
            raw = await GeminiAdapter().ainvoke_structured(prompt, DepartmentSelection)
            if isinstance(raw, dict) and raw.get("parsed") is not None:
                raw = raw["parsed"]
            parsed = raw if isinstance(raw, DepartmentSelection) else DepartmentSelection.model_validate(raw)
            if parsed.department and parsed.confidence >= 0.55 and any(parsed.department == item.get("name") for item in departments):
                return parsed.department
        except Exception:
            # Candidate presentation remains the safe fallback when provider
            # output is unavailable or does not match authoritative data.
            pass
    return _deterministic_department(query, departments)


def _tool_result_response(tool_name: str | None, result: Any) -> str:
    if isinstance(result, dict) and result.get("error"):
        return "Mình chưa thể lấy dữ liệu y tế lúc này. Bạn thử lại sau nhé."
    if tool_name == "healthcare.hold_slot" and isinstance(result, dict):
        return "Mình đã giữ khung giờ khám trong 10 phút. Bạn xác nhận lần cuối để hoàn tất đặt lịch nhé."
    if tool_name == "healthcare.cancel_appointment":
        return "Mình đã hủy lịch khám theo yêu cầu của bạn."
    if isinstance(result, list):
        if not result:
            return "Mình chưa tìm thấy lựa chọn phù hợp. Bạn thử chuyên khoa khác nhé."
        if isinstance(result[0], dict) and "available_slots" in result[0]:
            candidates = []
            for item in result:
                doctor_name = str(item.get("name", "bác sĩ"))
                actual_slots = item.get("available_slots", [])
                slot_times = [str(slot.get("start_time")) for slot in actual_slots if isinstance(slot, dict) and slot.get("start_time")]
                candidates.append(f"{doctor_name} ({', '.join(slot_times) or 'chưa có giờ trống'})")
            return "Mình tìm thấy các bác sĩ: " + "; ".join(candidates) + ". Bạn chọn bác sĩ và khung giờ phù hợp nhé."
        names = [str(item.get("name", "chuyên khoa")) for item in result if isinstance(item, dict)]
        return "Các chuyên khoa hiện có: " + ", ".join(names) + "."
    return "Mình đã nhận được kết quả khám."


async def classify_and_extract(state: AgentState) -> dict[str, Any]:
    query = str(state.get("query", ""))
    context = dict(state.get("context", {}))
    previous_intent = state.get("intent")
    tool_result = context.get("tool_result")
    if not _healthcare_message(query, previous_intent) and not tool_result:
        return {"intent": "general_chat", "slots": {}, "status": "COMPLETED"}

    slots = _extract_slots(query, context, tool_result)
    workflow_id = str(state["workflow_id"])
    turn_id = str(state.get("turn_id", "1"))
    folded = _fold(query)

    if context.get("tool_result_only") and tool_result is not None:
        if context.get("tool_name") == "healthcare.list_departments" and isinstance(tool_result, list):
            departments = [item for item in tool_result if isinstance(item, dict)]
            selected_department = await _select_department(query, departments)
            if selected_department:
                slots["department"] = selected_department
                return {
                    "intent": "healthcare_booking",
                    "slots": slots,
                    "status": "TOOL_REQUEST_READY",
                    "response": "Mình đã chọn chuyên khoa phù hợp và sẽ lấy bác sĩ, khung giờ còn trống.",
                    "tool_request": _tool_request(
                        "healthcare.list_slots",
                        "READ",
                        {"department": selected_department},
                        workflow_id,
                        turn_id,
                    ),
                }
        return {
            "intent": "healthcare_booking",
            "slots": slots,
            "status": "COMPLETED",
            "response": _tool_result_response(context.get("tool_name"), tool_result),
        }

    if slots.get("appointment_id") and (
        any(term in folded for term in ("xac nhan lich", "xac nhan dat", "hoan tat lich"))
        or "xac nhan" in folded
    ):
        return {
            "intent": "healthcare_booking",
            "slots": slots,
            "status": "TOOL_REQUEST_READY",
            "tool_request": _tool_request(
                "healthcare.confirm_appointment",
                "FINANCIAL_OR_FINAL",
                {"appointment_id": int(slots["appointment_id"])},
                workflow_id,
                turn_id,
                f"healthcare-confirm-{workflow_id}-{turn_id}",
            ),
        }

    if any(term in folded for term in ("huy lich", "huy cuoc hen")):
        if not slots.get("appointment_id"):
            return {"intent": "healthcare_booking", "slots": slots, "missing_slots": ["appointment_id"], "status": "NEEDS_INPUT"}
        return {
            "intent": "healthcare_booking",
            "slots": slots,
            "status": "TOOL_REQUEST_READY",
            "tool_request": _tool_request(
                "healthcare.cancel_appointment",
                "REVERSIBLE_WRITE",
                {"appointment_id": int(slots["appointment_id"])},
                workflow_id,
                turn_id,
                f"healthcare-cancel-{workflow_id}-{turn_id}",
            ),
        }

    if not slots.get("department"):
        return {
            "intent": "healthcare_booking",
            "slots": slots,
            "status": "TOOL_REQUEST_READY",
            "tool_request": _tool_request("healthcare.list_departments", "READ", {}, workflow_id, turn_id),
        }

    if not slots.get("slot_id"):
        return {
            "intent": "healthcare_booking",
            "slots": slots,
            "status": "TOOL_REQUEST_READY",
            "tool_request": _tool_request(
                "healthcare.list_slots",
                "READ",
                {"department": str(slots["department"])},
                workflow_id,
                turn_id,
            ),
        }

    if not slots.get("patient_id"):
        return {"intent": "healthcare_booking", "slots": slots, "missing_slots": ["patient_id"], "status": "NEEDS_INPUT"}
    if not _is_confirmation(query):
        return {"intent": "healthcare_booking", "slots": slots, "status": "NEEDS_INPUT", "missing_slots": ["confirmation"]}

    return {
        "intent": "healthcare_booking",
        "slots": slots,
        "status": "TOOL_REQUEST_READY",
        "tool_request": _tool_request(
            "healthcare.hold_slot",
            "REVERSIBLE_WRITE",
            {
                "slot_id": int(slots["slot_id"]),
                "patient_id": int(slots["patient_id"]),
                "symptoms": str(context.get("symptoms", "General consultation")),
            },
            workflow_id,
            turn_id,
            f"healthcare-hold-{workflow_id}-{turn_id}",
        ),
    }


def compose_healthcare_response(state: AgentState) -> dict[str, Any]:
    if state.get("status") == "NEEDS_INPUT":
        labels = {
            "department": "chuyên khoa",
            "slot_id": "khung giờ cần chọn",
            "patient_id": "thông tin người bệnh trong hồ sơ",
            "appointment_id": "mã lịch hẹn",
            "confirmation": "xác nhận giữ lịch",
        }
        missing = state.get("missing_slots", ["thông tin cần thiết"])
        return {"response": f"Bạn cho mình biết {labels.get(str(missing[0]), str(missing[0]))} nhé."}
    if state.get("status") == "TOOL_REQUEST_READY":
        return {"response": "Mình sẽ kiểm tra lựa chọn khám phù hợp cho bạn.", "tool_request": state.get("tool_request")}
    if state.get("intent") == "general_chat":
        return {"response": "Mình có thể hỗ trợ tìm chuyên khoa, bác sĩ và khung giờ khám."}
    return {"response": state.get("response", "Mình đã xử lý yêu cầu Healthcare của bạn.")}


def build_healthcare_graph():
    graph = StateGraph(AgentState)
    graph.add_node("classify_and_extract", classify_and_extract)
    graph.add_node("compose_response", compose_healthcare_response)
    graph.set_entry_point("classify_and_extract")
    graph.add_edge("classify_and_extract", "compose_response")
    graph.add_edge("compose_response", END)
    return graph.compile()


agent = build_healthcare_graph()
