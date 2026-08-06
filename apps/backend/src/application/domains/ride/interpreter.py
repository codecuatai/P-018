"""Turn-level understanding for a ride conversation.

This module turns a free-form rider message into a small, validated patch.  It
does not call a Ride Service and it does not decide whether a transaction may
be executed.  That separation lets the workflow merge only explicit facts,
invalidate stale estimates on corrections, and ask for one missing field at a
time.
"""

from __future__ import annotations

import re
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from src.application.domains.ride.parser import RideInputParser
from src.application.domains.ride.state import RideDraft, TurnPatch


INTERPRETER_PROMPT = """You extract an incremental, structured update from one
Vietnamese rider message for NaviGo. You are not a chat assistant and must not
call tools or invent facts.

Return a TurnPatch. Populate slot_updates only with values explicitly stated
or unambiguously corrected by the rider. Recognized slots include
pickup_address, dropoff_address, vehicle_type, promo_code, seat_count,
scheduled_at, pickup_notes, latest_quote_id and latest_booking_id.

Use an intent such as inform, request_quote, confirm_quote, request_status,
cancel_booking, or casual. Set explicit_confirmation only when the rider
clearly accepts an existing quote. Put changed slot names in corrections. If a
location is vague (for example 'here'), do not turn it into a concrete
address. Preserve Vietnamese text exactly where possible.
"""


class RideTurnInterpreter:
    """Fast deterministic extraction with an optional structured-LLM fallback.

    The deterministic path handles common explicit route syntax without an
    additional model call. If it cannot confidently find a requested location
    or the message is a correction, a configured model may produce the same
    bounded ``TurnPatch`` schema. Local/no-key development remains functional.
    """

    _confirmation = re.compile(r"\b(xác nhận|xac nhan|đồng ý|dong y|chốt|ok|oke)\b", re.IGNORECASE)
    _cancel = re.compile(r"\b(hủy|huy|cancel)\b", re.IGNORECASE)
    _status = re.compile(r"\b(trạng thái|trang thai|tình trạng|tinh trang|tài xế|tai xe|cập nhật|cap nhat)\b", re.IGNORECASE)
    _quote = re.compile(r"\b(báo giá|bao gia|giá xe|gia xe|đặt xe|dat xe|gọi xe|goi xe)\b", re.IGNORECASE)
    _correction = re.compile(r"\b(đổi|doi|sửa|sua|không phải|khong phai|thay bằng|thay bang|chuyển sang|chuyen sang)\b", re.IGNORECASE)

    def __init__(self, llm: BaseChatModel | None = None):
        self.llm = llm

    async def interpret(self, message: str, draft: RideDraft) -> TurnPatch:
        baseline = self._deterministic_patch(message, draft)
        if not self._needs_model(message, draft, baseline) or self.llm is None:
            return baseline
        try:
            structured = self.llm.with_structured_output(TurnPatch)
            result = await structured.ainvoke(
                [
                    SystemMessage(content=INTERPRETER_PROMPT),
                    HumanMessage(
                        content=(
                            f"Current known trip state: {draft.model_dump_json()}\n"
                            f"Rider message: {message}"
                        )
                    ),
                ]
            )
            patch = result if isinstance(result, TurnPatch) else TurnPatch.model_validate(result)
            return self._merge_model_result(baseline, patch)
        except Exception:
            # Interpretation is advisory. Failure must never block a normal
            # deterministic ride flow or cause a service call on guessed data.
            return baseline

    @classmethod
    def _deterministic_patch(cls, message: str, draft: RideDraft) -> TurnPatch:
        fields = RideInputParser.extract(message)
        normalized = message.lower()
        if cls._cancel.search(message):
            intent = "cancel_booking"
        elif cls._status.search(message):
            intent = "request_status"
        elif draft.latest_quote_id and cls._confirmation.search(message):
            intent = "confirm_quote"
        elif cls._quote.search(message) or fields:
            intent = "request_quote"
        else:
            intent = "casual"
        corrections = list(fields) if cls._correction.search(message) else []
        return TurnPatch(
            intent=intent,
            slot_updates=fields,
            confidence=0.95 if fields else 0.65,
            explicit_confirmation=intent == "confirm_quote",
            corrections=corrections,
        )

    @staticmethod
    def _merge_model_result(baseline: TurnPatch, model: TurnPatch) -> TurnPatch:
        # Explicit deterministic IDs and values are preserved; model output can
        # add missing, differently phrased facts but can never erase them.
        slots: dict[str, Any] = {**model.slot_updates, **baseline.slot_updates}
        return TurnPatch(
            intent=baseline.intent if baseline.intent != "casual" else model.intent,
            slot_updates=slots,
            confidence=max(baseline.confidence, model.confidence),
            explicit_confirmation=baseline.explicit_confirmation or model.explicit_confirmation,
            corrections=list(dict.fromkeys([*baseline.corrections, *model.corrections])),
        )

    @classmethod
    def _needs_model(cls, message: str, draft: RideDraft, baseline: TurnPatch) -> bool:
        if baseline.intent in {"cancel_booking", "request_status", "confirm_quote"}:
            return False
        if baseline.slot_updates and len({"pickup_address", "dropoff_address"} & set(baseline.slot_updates)) == 2:
            return False
        if cls._correction.search(message):
            return True
        # Use the model only when the rider appears to be discussing a ride and
        # the current deterministic parse cannot complete the route.
        route_is_incomplete = not draft.pickup_address or not draft.dropoff_address
        return baseline.intent == "request_quote" and route_is_incomplete
