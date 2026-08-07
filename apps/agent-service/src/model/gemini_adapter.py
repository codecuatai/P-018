from typing import Any, Literal

from pydantic import BaseModel, Field

from src.config import get_settings


class GeminiExtraction(BaseModel):
    intent: Literal["restaurant_booking", "healthcare_request", "general_chat", "clarification_answer", "correction_update"]
    slot_patch: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(default=0.0, ge=0, le=1)


class GeminiAdapter:
    """Structured-output Gemini adapter; imported lazily to keep tests offline."""

    def __init__(self) -> None:
        settings = get_settings()
        from langchain_google_genai import ChatGoogleGenerativeAI

        self._model = ChatGoogleGenerativeAI(
            model=settings.gemini_model,
            google_api_key=settings.gemini_api_key,
            temperature=settings.llm_temperature,
        ).with_structured_output(GeminiExtraction)

    async def extract(self, message: str, workflow: dict[str, Any]) -> dict[str, Any]:
        prompt = (
            "Bạn là bộ phân tích intent/slot cho trợ lý đặt bàn. "
            "Chỉ trả JSON theo schema. Không gọi tool, không đặt bàn, không bịa dữ liệu. "
            "Các slot được phép: party_size, local_date (YYYY-MM-DD), local_time (HH:MM), "
            "location, restaurant_id, duration_minutes, seating_type, special_requests.\n"
            f"Workflow hiện tại: {workflow}\nTin nhắn mới: {message}"
        )
        result = await self._model.ainvoke(prompt)
        return result.model_dump()
