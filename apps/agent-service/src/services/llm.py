from __future__ import annotations

from typing import Any, Protocol

from pydantic import BaseModel

from src.config import get_settings


class LLMAdapter(Protocol):
    async def ainvoke(self, prompt: str) -> Any: ...

    async def ainvoke_structured(self, prompt: str, schema: type[BaseModel]) -> Any: ...


class GeminiAdapter:
    """Lazy Gemini boundary. Tests can inject a fake adapter and no key is needed."""

    def _model(self) -> Any:
        settings = get_settings()
        if not settings.gemini_api_key:
            return None
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(model=settings.gemini_model, google_api_key=settings.gemini_api_key, temperature=settings.llm_temperature)

    async def ainvoke(self, prompt: str) -> Any:
        model = self._model()
        if model is None:
            return ""
        response: Any = await model.ainvoke(prompt)
        return response

    async def ainvoke_structured(self, prompt: str, schema: type[BaseModel]) -> Any:
        model = self._model()
        if model is None:
            return ""
        try:
            structured = model.with_structured_output(schema, method="json_schema", include_raw=True)
            return await structured.ainvoke(prompt)
        except (NotImplementedError, TypeError, ValueError):
            # Some provider/model combinations expose the adapter but reject native
            # JSON Schema. Return the raw response to the graph's validated parser.
            return await self.ainvoke(prompt)


def get_llm_config() -> dict[str, str]:
    settings = get_settings()
    return {"model": settings.gemini_model, "api_key_configured": "true" if settings.gemini_api_key else "false"}
