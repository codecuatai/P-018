from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal, Protocol

from pydantic import BaseModel

from ..config import get_settings


class LLMAdapter(Protocol):
    async def ainvoke(self, prompt: str) -> Any: ...

    async def ainvoke_structured(self, prompt: str, schema: type[BaseModel]) -> Any: ...


ProviderErrorCategory = Literal[
    "authentication_or_permission",
    "quota_or_rate_limit",
    "temporary_provider_failure",
    "timeout_or_network",
    "model_unavailable",
    "schema_or_capability",
    "other",
]
ModelInvocation = Literal["raw", "structured"]

MODEL_RUNTIME_DIAGNOSTICS: dict[str, Any] = {
    "configured_primary": None,
    "configured_fallback": None,
    "last_model_used": None,
    "fallback_used": False,
    "fallback_model_attempted": False,
    "structured_output_fallback_used": False,
    "last_model_call_at": None,
    "last_model_call_status": "not_called",
    "last_model_call_error": None,
    "last_model_call_http_status": None,
    "last_model_call_category": None,
    "last_model_call_invocation": None,
}


def llm_diagnostics(settings: Any | None = None) -> dict[str, Any]:
    """Return safe runtime diagnostics without error text, prompts, or secrets."""
    current = settings or get_settings()
    MODEL_RUNTIME_DIAGNOSTICS["configured_primary"] = str(getattr(current, "gemini_model", ""))
    MODEL_RUNTIME_DIAGNOSTICS["configured_fallback"] = str(getattr(current, "gemini_fallback_model", ""))
    return dict(MODEL_RUNTIME_DIAGNOSTICS)


def _status_code(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        status = int(value)
    except (TypeError, ValueError):
        return None
    return status if 100 <= status <= 599 else None


def provider_status_code(error: BaseException) -> int | None:
    """Extract only a numeric status from common provider/HTTP exception shapes."""
    candidates: list[BaseException] = [error]
    for nested in (getattr(error, "__cause__", None), getattr(error, "__context__", None)):
        if isinstance(nested, BaseException) and nested not in candidates:
            candidates.append(nested)
    for candidate in candidates:
        for value in (
            getattr(candidate, "status_code", None),
            getattr(candidate, "code", None),
            getattr(getattr(candidate, "response", None), "status_code", None),
        ):
            status = _status_code(value)
            if status is not None:
                return status
    return None


def provider_error_category(error: BaseException) -> ProviderErrorCategory:
    """Classify a provider failure without returning its message or payload."""
    status = provider_status_code(error)
    text = str(error).casefold()
    name = type(error).__name__.casefold()

    if status == 429 or any(marker in text for marker in ("quota", "rate limit", "resource exhausted", "resource_exhausted")):
        return "quota_or_rate_limit"
    if status in {401, 403} or any(
        marker in text
        for marker in (
            "api key",
            "api_key",
            "unauthorized",
            "forbidden",
            "permission denied",
            "permission_denied",
            "billing",
            "credential",
        )
    ):
        return "authentication_or_permission"
    if status in {408, 504} or isinstance(error, TimeoutError | ConnectionError | OSError) or any(
        marker in name or marker in text
        for marker in ("timeout", "timed out", "deadline exceeded", "connecterror", "connection error", "network", "socket")
    ):
        return "timeout_or_network"
    if status is not None and 500 <= status <= 599:
        return "temporary_provider_failure"
    if status == 404:
        return "model_unavailable"

    schema_marker = any(
        marker in text
        for marker in ("response_schema", "response schema", "json_schema", "json schema", "structured output", "structured_output", "response_mime_type")
    )
    capability_marker = any(
        marker in text
        for marker in ("not supported", "unsupported", "not implemented", "does not support", "capability")
    )
    if schema_marker and capability_marker:
        return "schema_or_capability"

    model_marker = "model" in text and any(
        marker in text
        for marker in ("not found", "unavailable", "not supported", "unsupported", "does not exist", "not available")
    )
    if model_marker:
        return "model_unavailable"
    return "other"


def is_structured_schema_capability_error(error: BaseException) -> bool:
    """Whether raw output on the same model is safe to try after native schema failure."""
    category = provider_error_category(error)
    if category == "authentication_or_permission":
        return False
    return isinstance(error, NotImplementedError | TypeError | ValueError) or category == "schema_or_capability"


def should_attempt_fallback_model(error: BaseException) -> bool:
    """Only transient or confirmed model-capability failures can use a configured fallback."""
    return provider_error_category(error) in {
        "quota_or_rate_limit",
        "temporary_provider_failure",
        "timeout_or_network",
        "model_unavailable",
    }


def _record_model_call(
    settings: Any,
    model_name: str,
    status: Literal["success", "failed"],
    invocation: ModelInvocation,
    *,
    error: BaseException | None = None,
    fallback_model_attempted: bool = False,
    structured_output_fallback_used: bool = False,
) -> None:
    error_status = provider_status_code(error) if error else None
    error_category = provider_error_category(error) if error else None
    MODEL_RUNTIME_DIAGNOSTICS.update(
        {
            "configured_primary": str(settings.gemini_model),
            "configured_fallback": str(getattr(settings, "gemini_fallback_model", "")),
            "last_model_used": model_name,
            "fallback_used": model_name != str(settings.gemini_model),
            "fallback_model_attempted": fallback_model_attempted,
            "structured_output_fallback_used": structured_output_fallback_used,
            "last_model_call_at": datetime.now(UTC).isoformat(),
            "last_model_call_status": status,
            "last_model_call_error": type(error).__name__ if error else None,
            "last_model_call_http_status": error_status,
            "last_model_call_category": error_category,
            "last_model_call_invocation": invocation,
        }
    )


def gemini_model_names(settings: Any) -> tuple[str, ...]:
    """Return the configured model followed by the explicitly configured fallback."""
    names = [str(settings.gemini_model)]
    fallback = str(getattr(settings, "gemini_fallback_model", "gemini-3.1-flash-lite"))
    if fallback and fallback not in names:
        names.append(fallback)
    return tuple(names)


def _is_generation_three_sampling_restricted(model_name: str) -> bool:
    """Generation-three Gemini models reject the legacy sampling fields."""
    normalized = model_name.removeprefix("models/").strip().casefold()
    return normalized == "gemini-3" or normalized.startswith(("gemini-3.", "gemini-3-"))


def _sampling_kwargs(settings: Any, model_name: str) -> dict[str, Any]:
    if _is_generation_three_sampling_restricted(model_name):
        return {}
    kwargs: dict[str, Any] = {"temperature": settings.llm_temperature}
    # Keep optional legacy settings compatible when a standalone deployment
    # provides them, without adding new environment/configuration surface.
    for setting_name, provider_name in (("llm_top_p", "top_p"), ("llm_top_k", "top_k")):
        value = getattr(settings, setting_name, None)
        if value is not None:
            kwargs[provider_name] = value
    return kwargs


def build_chat_model(settings: Any, model_name: str) -> Any:
    from langchain_google_genai import ChatGoogleGenerativeAI

    kwargs = {
        "model": model_name,
        "google_api_key": settings.gemini_api_key,
        **_sampling_kwargs(settings, model_name),
    }
    return ChatGoogleGenerativeAI(
        **kwargs,
    )


def is_quota_or_rate_limit_error(error: BaseException) -> bool:
    """Compatibility helper retained for legacy callers."""
    return provider_error_category(error) == "quota_or_rate_limit"


class GeminiAdapter:
    """Lazy Gemini boundary. Tests inject fakes and production never logs provider payloads."""

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
        fallback_attempted = False
        for index, model_name in enumerate(model_names):
            try:
                response: Any = await self._model(model_name).ainvoke(prompt)
                _record_model_call(settings, model_name, "success", "raw", fallback_model_attempted=fallback_attempted)
                return response
            except Exception as error:
                if should_attempt_fallback_model(error) and index < len(model_names) - 1:
                    fallback_attempted = True
                    continue
                _record_model_call(settings, model_name, "failed", "raw", error=error, fallback_model_attempted=fallback_attempted)
                raise
        raise RuntimeError("Gemini model invocation did not produce a result.")

    async def ainvoke_structured(self, prompt: str, schema: type[BaseModel]) -> Any:
        settings = get_settings()
        if not settings.gemini_api_key:
            return ""
        model_names = gemini_model_names(settings)
        fallback_attempted = False
        for index, model_name in enumerate(model_names):
            model = self._model(model_name)
            invocation: ModelInvocation = "structured"
            try:
                try:
                    structured = model.with_structured_output(schema, method="json_schema", include_raw=True)
                    result = await structured.ainvoke(prompt)
                except Exception as structured_error:
                    if not is_structured_schema_capability_error(structured_error):
                        raise
                    # A confirmed native-schema capability failure can use the
                    # same model in raw mode; downstream parsers still validate
                    # the Assistant schema before accepting it.
                    invocation = "raw"
                    result = await model.ainvoke(prompt)
                    _record_model_call(
                        settings,
                        model_name,
                        "success",
                        "raw",
                        fallback_model_attempted=fallback_attempted,
                        structured_output_fallback_used=True,
                    )
                    return result
                _record_model_call(settings, model_name, "success", "structured", fallback_model_attempted=fallback_attempted)
                return result
            except Exception as error:
                if should_attempt_fallback_model(error) and index < len(model_names) - 1:
                    fallback_attempted = True
                    continue
                _record_model_call(settings, model_name, "failed", invocation, error=error, fallback_model_attempted=fallback_attempted)
                raise
        raise RuntimeError("Gemini structured invocation did not produce a result.")


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
