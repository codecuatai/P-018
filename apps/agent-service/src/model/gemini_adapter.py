from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from src.config import get_settings
from src.services.llm import build_chat_model, gemini_model_names, should_attempt_fallback_model


class GeminiExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    intent: Literal["ride", "food", "restaurant", "healthcare", "general_support"]
    slot_patch: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(default=0.0, ge=0, le=1)


class ComposerOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=1200)
    question_focus: str | None = Field(default=None, max_length=200)


class GeminiAdapter:
    """Structured-output Gemini adapter; imported lazily to keep tests offline."""

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise ValueError("Gemini API key is not configured.")
        self._settings = settings

    async def extract(self, message: str, workflow: dict[str, Any]) -> dict[str, Any]:
        prompt = (
            "Bạn là bộ phân tích intent/slot cho trợ lý dịch vụ X-One. "
            "Chỉ trả JSON theo schema. Không gọi tool, không đặt dịch vụ, không bịa dữ liệu. "
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
                if not should_attempt_fallback_model(error) or index == len(model_names) - 1:
                    raise
        if last_error:
            raise last_error
        raise RuntimeError("Gemini model invocation did not produce a result.")

    async def compose(self, message: str, tasks: list[dict[str, Any]], authoritative_results: list[dict[str, Any]]) -> str:
        prompt = (
            "Viết một tin nhắn trả lời bằng tiếng Việt cho người dùng dựa trên thông tin authoritative được cung cấp. "
            "Không bao giờ bịa đặt thành công của dịch vụ nếu kết quả không xác nhận."
            f"\nTasks: {tasks}\nKết quả Authoritative: {authoritative_results}\nTin nhắn người dùng: {message}"
        )
        last_error: Exception | None = None
        model_names = gemini_model_names(self._settings)
        for index, model_name in enumerate(model_names):
            try:
                model = build_chat_model(self._settings, model_name).with_structured_output(ComposerOutput)
                result = await model.ainvoke(prompt)
                return result.message
            except Exception as error:
                last_error = error
                if not should_attempt_fallback_model(error) or index == len(model_names) - 1:
                    raise
        if last_error:
            raise last_error
        raise RuntimeError("Gemini composer did not produce a result.")
