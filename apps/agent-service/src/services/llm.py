from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Protocol

from pydantic import BaseModel

from src.config import get_settings


class LLMAdapter(Protocol):
    async def ainvoke(self, prompt: str) -> Any: ...

    async def ainvoke_structured(self, prompt: str, schema: type[BaseModel]) -> Any: ...


MODEL_RUNTIME_DIAGNOSTICS: dict[str, Any] = {
    "configured_primary": None,
    "configured_fallback": None,
    "last_model_used": None,
    "fallback_used": False,
    "last_model_call_at": None,
    "last_model_call_status": "not_called",
    "last_model_call_error": None,
}


def llm_diagnostics(settings: Any | None = None) -> dict[str, Any]:
    current = settings or get_settings()
    MODEL_RUNTIME_DIAGNOSTICS["configured_primary"] = str(getattr(current, "gemini_model", ""))
    MODEL_RUNTIME_DIAGNOSTICS["configured_fallback"] = str(getattr(current, "gemini_fallback_model", ""))
    return dict(MODEL_RUNTIME_DIAGNOSTICS)


def _record_model_call(settings: Any, model_name: str, status: str, error: BaseException | None = None) -> None:
    MODEL_RUNTIME_DIAGNOSTICS.update(
        {
            "configured_primary": str(settings.gemini_model),
            "configured_fallback": str(getattr(settings, "gemini_fallback_model", "")),
            "last_model_used": model_name,
            "fallback_used": model_name != str(settings.gemini_model),
            "last_model_call_at": datetime.now(UTC).isoformat(),
            "last_model_call_status": status,
            "last_model_call_error": type(error).__name__ if error else None,
        }
    )


def gemini_model_names(settings: Any) -> tuple[str, ...]:
    """Return the configured model followed by the local quota fallback."""
    names = [str(settings.gemini_model)]
    fallback = str(getattr(settings, "gemini_fallback_model", "gemini-3.1-flash-lite"))
    if fallback and fallback not in names:
        names.append(fallback)
    return tuple(names)


def build_chat_model(settings: Any, model_name: str) -> Any:
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=settings.gemini_api_key,
        temperature=settings.llm_temperature,
    )


def is_quota_or_rate_limit_error(error: BaseException) -> bool:
    """Identify provider quota/rate-limit failures without exposing provider data."""
    status_code = getattr(error, "status_code", None)
    if status_code == 429:
        return True
    response = getattr(error, "response", None)
    if getattr(response, "status_code", None) == 429:
        return True
    message = str(error).casefold()
    return "quota" in message or "rate limit" in message or "resource exhausted" in message or "429" in message


class GeminiAdapter:
    """Lazy Gemini boundary. Tests can inject a fake adapter and no key is needed."""

    def _model(self, model_name: str | None = None) -> Any:
        settings = get_settings()
        if not settings.gemini_api_key:
            return None
        return build_chat_model(settings, model_name or settings.gemini_model)

    async def ainvoke(self, prompt: str) -> Any:
        settings = get_settings()
        if not settings.gemini_api_key:
            return ""
        model_names = gemini_model_names(settings)
        last_error: Exception | None = None
        for index, model_name in enumerate(model_names):
            try:
                response: Any = await self._model(model_name).ainvoke(prompt)
                _record_model_call(settings, model_name, "success")
                return response
            except Exception as error:
                last_error = error
                if not is_quota_or_rate_limit_error(error) or index == len(model_names) - 1:
                    _record_model_call(settings, model_name, "failed", error)
                    raise
        if last_error:
            raise last_error
        return ""

    async def ainvoke_structured(self, prompt: str, schema: type[BaseModel]) -> Any:
        settings = get_settings()
        if not settings.gemini_api_key:
            return ""
        model_names = gemini_model_names(settings)
        last_error: Exception | None = None
        for index, model_name in enumerate(model_names):
            model = self._model(model_name)
            try:
                try:
                    structured = model.with_structured_output(schema, method="json_schema", include_raw=True)
                    result = await structured.ainvoke(prompt)
                    _record_model_call(settings, model_name, "success")
                    return result
                except (NotImplementedError, TypeError, ValueError):
                    # Some provider/model combinations expose the adapter but reject native
                    # JSON Schema. Return the raw response to the graph's validated parser.
                    result = await model.ainvoke(prompt)
                    _record_model_call(settings, model_name, "success")
                    return result
            except Exception as error:
                last_error = error
                if not is_quota_or_rate_limit_error(error) or index == len(model_names) - 1:
                    _record_model_call(settings, model_name, "failed", error)
                    raise
        if last_error:
            raise last_error
        return ""


def get_llm_config() -> dict[str, str]:
    settings = get_settings()
    runtime = llm_diagnostics(settings)
    return {
        "model": settings.gemini_model,
        "fallback_model": settings.gemini_fallback_model,
        "api_key_configured": "true" if settings.gemini_api_key else "false",
        "last_model_used": str(runtime["last_model_used"] or ""),
        "fallback_used": "true" if runtime["fallback_used"] else "false",
        "last_model_call_status": str(runtime["last_model_call_status"]),
    }
