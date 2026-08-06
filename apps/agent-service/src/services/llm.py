from __future__ import annotations

from typing import Any, Protocol

from src.config import get_settings


class LLMAdapter(Protocol):
    async def ainvoke(self, prompt: str) -> str: ...


class GeminiAdapter:
    """Lazy Gemini boundary. Tests can inject a fake adapter and no key is needed."""

    async def ainvoke(self, prompt: str) -> str:
        settings = get_settings()
        if not settings.gemini_api_key:
            return ""
        from langchain_google_genai import ChatGoogleGenerativeAI

        model = ChatGoogleGenerativeAI(model=settings.gemini_model, google_api_key=settings.gemini_api_key, temperature=settings.llm_temperature)
        response: Any = await model.ainvoke(prompt)
        return str(getattr(response, "content", response))


def get_llm_config() -> dict[str, str]:
    settings = get_settings()
    return {"model": settings.gemini_model, "api_key_configured": "true" if settings.gemini_api_key else "false"}
