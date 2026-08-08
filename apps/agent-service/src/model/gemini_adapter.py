from typing import Any, Literal

from pydantic import BaseModel, Field

from src.config import get_settings
from src.services.llm import build_chat_model, gemini_model_names, is_quota_or_rate_limit_error


class GeminiExtraction(BaseModel):
    intent: Literal["restaurant_booking", "healthcare_request", "general_chat", "clarification_answer", "correction_update"]
    slot_patch: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(default=0.0, ge=0, le=1)


class GeminiAdapter:
    """Structured-output Gemini adapter; imported lazily to keep tests offline."""

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise ValueError("Gemini API key is not configured.")
        self._settings = settings

    async def extract(self, message: str, workflow: dict[str, Any]) -> dict[str, Any]:
        prompt = (
            "Bạn là bộ phân tích intent/slot cho trợ lý đặt bàn. "
            "Chỉ trả JSON theo schema. Không gọi tool, không đặt bàn, không bịa dữ liệu. "
            "Các slot được phép: party_size, local_date (YYYY-MM-DD), local_time (HH:MM), "
            "location, restaurant_id, duration_minutes, seating_type, special_requests.\n"
            f"Workflow hiện tại: {workflow}\nTin nhắn mới: {message}"
        )
        last_error: Exception | None = None
        model_names = gemini_model_names(self._settings)
        for index, model_name in enumerate(model_names):
            try:
                model = build_chat_model(self._settings, model_name).with_structured_output(GeminiExtraction)
                result = await model.ainvoke(prompt)
                return result.model_dump()
            except Exception as error:
                last_error = error
                if not is_quota_or_rate_limit_error(error) or index == len(model_names) - 1:
                    raise
        if last_error:
            raise last_error
        raise RuntimeError("Gemini model invocation did not produce a result.")
