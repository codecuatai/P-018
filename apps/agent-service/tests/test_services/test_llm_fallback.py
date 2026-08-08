from types import SimpleNamespace
from typing import Any

import pytest
import src.services.llm as llm_module


class FakeModel:
    def __init__(self, name: str) -> None:
        self.name = name

    def with_structured_output(self, schema: type[Any], method: str, include_raw: bool) -> "FakeModel":
        assert method == "json_schema"
        assert include_raw is True
        return self

    async def ainvoke(self, _prompt: str) -> Any:
        if self.name == "gemini-3.5-flash-lite":
            raise RuntimeError("429 quota exceeded")
        return {"parsed": {"department": "Khoa Nội Tiêu hóa", "confidence": 0.9}}


@pytest.mark.asyncio
async def test_structured_call_falls_back_to_secondary_model_on_quota(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = SimpleNamespace(
        gemini_api_key="configured",
        gemini_model="gemini-3.5-flash-lite",
        gemini_fallback_model="gemini-3.1-flash-lite",
        llm_temperature=0.0,
    )
    monkeypatch.setattr(llm_module, "get_settings", lambda: settings)
    monkeypatch.setattr(llm_module, "build_chat_model", lambda _settings, model_name: FakeModel(model_name))

    result = await llm_module.GeminiAdapter().ainvoke_structured("select a department", object)  # type: ignore[arg-type]

    assert result["parsed"]["department"] == "Khoa Nội Tiêu hóa"

