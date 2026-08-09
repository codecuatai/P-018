from types import SimpleNamespace
from typing import Any

import langchain_google_genai
import pytest
import src.services.llm as llm_module
from pydantic import BaseModel


class ProviderError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class Department(BaseModel):
    department: str


@pytest.fixture(autouse=True)
def reset_model_diagnostics() -> None:
    llm_module.MODEL_RUNTIME_DIAGNOSTICS.clear()
    llm_module.MODEL_RUNTIME_DIAGNOSTICS.update(
        {
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
    )


def settings() -> SimpleNamespace:
    return SimpleNamespace(
        gemini_api_key="configured",
        gemini_model="primary-model",
        gemini_fallback_model="fallback-model",
        llm_temperature=0.0,
    )


@pytest.mark.parametrize(
    "model_name",
    [
        "gemini-3.1-flash-lite",
        "models/gemini-3.1-flash-lite",
        "gemini-3.5-flash-lite",
        "gemini-3.6-flash",
        "gemini-3-flash-preview",
    ],
)
def test_build_chat_model_omits_sampling_kwargs_for_generation_three_models(
    monkeypatch: pytest.MonkeyPatch,
    model_name: str,
) -> None:
    captured: list[dict[str, Any]] = []

    class CapturingChatModel:
        def __init__(self, **kwargs: Any) -> None:
            captured.append(kwargs)

    monkeypatch.setattr(langchain_google_genai, "ChatGoogleGenerativeAI", CapturingChatModel)
    configured = settings()
    configured.llm_top_p = 0.8
    configured.llm_top_k = 20

    llm_module.build_chat_model(configured, model_name)

    assert captured == [{"model": model_name, "google_api_key": "configured"}]


def test_build_chat_model_keeps_sampling_kwargs_for_older_configured_model(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[dict[str, Any]] = []

    class CapturingChatModel:
        def __init__(self, **kwargs: Any) -> None:
            captured.append(kwargs)

    monkeypatch.setattr(langchain_google_genai, "ChatGoogleGenerativeAI", CapturingChatModel)
    configured = settings()
    configured.llm_temperature = 0.2
    configured.llm_top_p = 0.8
    configured.llm_top_k = 20

    llm_module.build_chat_model(configured, "gemini-2.5-flash-lite")

    assert captured == [{
        "model": "gemini-2.5-flash-lite",
        "google_api_key": "configured",
        "temperature": 0.2,
        "top_p": 0.8,
        "top_k": 20,
    }]


@pytest.mark.asyncio
async def test_restaurant_gemini_adapter_uses_shared_generation_three_builder(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import src.model.gemini_adapter as restaurant_adapter

    captured: list[dict[str, Any]] = []

    class CapturingChatModel:
        def __init__(self, **kwargs: Any) -> None:
            captured.append(kwargs)

        def with_structured_output(self, schema: type[Any]) -> "CapturingChatModel":
            assert schema is restaurant_adapter.GeminiExtraction
            return self

        async def ainvoke(self, _prompt: str) -> restaurant_adapter.GeminiExtraction:
            return restaurant_adapter.GeminiExtraction(
                intent="restaurant_booking",
                slot_patch={},
                confidence=1.0,
            )

    monkeypatch.setattr(langchain_google_genai, "ChatGoogleGenerativeAI", CapturingChatModel)
    configured = settings()
    configured.gemini_model = "models/gemini-3.1-flash-lite"
    configured.gemini_fallback_model = "gemini-2.5-flash-lite"
    monkeypatch.setattr(restaurant_adapter, "get_settings", lambda: configured)

    result = await restaurant_adapter.GeminiAdapter().extract("book a table", {})

    assert result["intent"] == "restaurant_booking"
    assert captured == [{"model": "models/gemini-3.1-flash-lite", "google_api_key": "configured"}]


class QuotaModel:
    def __init__(self, name: str) -> None:
        self.name = name

    def with_structured_output(self, schema: type[Any], method: str, include_raw: bool) -> "QuotaModel":
        assert method == "json_schema"
        assert include_raw is True
        return self

    async def ainvoke(self, _prompt: str) -> Any:
        if self.name == "primary-model":
            raise ProviderError("quota exhausted", 429)
        return {"parsed": {"department": "Khoa Nội Tiêu hóa", "confidence": 0.9}}


@pytest.mark.asyncio
async def test_structured_call_falls_back_to_secondary_model_on_quota(monkeypatch: pytest.MonkeyPatch) -> None:
    configured = settings()
    monkeypatch.setattr(llm_module, "get_settings", lambda: configured)
    monkeypatch.setattr(llm_module, "build_chat_model", lambda _settings, model_name: QuotaModel(model_name))

    result = await llm_module.GeminiAdapter().ainvoke_structured("select a department", Department)

    assert result["parsed"]["department"] == "Khoa Nội Tiêu hóa"
    diagnostics = llm_module.llm_diagnostics(configured)
    assert diagnostics["last_model_used"] == "fallback-model"
    assert diagnostics["fallback_used"] is True
    assert diagnostics["fallback_model_attempted"] is True
    assert diagnostics["last_model_call_status"] == "success"


class SchemaFailureRunner:
    async def ainvoke(self, _prompt: str) -> Any:
        raise ProviderError("response_schema is not supported for this model", 400)


class SchemaFallbackModel:
    def with_structured_output(self, schema: type[Any], method: str, include_raw: bool) -> SchemaFailureRunner:
        assert schema is Department
        assert method == "json_schema"
        assert include_raw is True
        return SchemaFailureRunner()

    async def ainvoke(self, _prompt: str) -> Any:
        return '{"department":"Khoa Thần kinh"}'


@pytest.mark.asyncio
async def test_provider_schema_capability_error_retries_raw_on_the_same_model(monkeypatch: pytest.MonkeyPatch) -> None:
    configured = settings()
    created: list[str] = []
    monkeypatch.setattr(llm_module, "get_settings", lambda: configured)

    def build(_settings: Any, model_name: str) -> SchemaFallbackModel:
        created.append(model_name)
        return SchemaFallbackModel()

    monkeypatch.setattr(llm_module, "build_chat_model", build)
    result = await llm_module.GeminiAdapter().ainvoke_structured("safe schema request", Department)

    assert result == '{"department":"Khoa Thần kinh"}'
    assert created == ["primary-model"]
    diagnostics = llm_module.llm_diagnostics(configured)
    assert diagnostics["last_model_used"] == "primary-model"
    assert diagnostics["last_model_call_invocation"] == "raw"
    assert diagnostics["structured_output_fallback_used"] is True
    assert diagnostics["fallback_model_attempted"] is False


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (ProviderError("quota exhausted", 429), "quota_or_rate_limit"),
        (ProviderError("temporarily unavailable", 503), "temporary_provider_failure"),
        (TimeoutError("deadline exceeded"), "timeout_or_network"),
        (ProviderError("model not found", 404), "model_unavailable"),
        (ProviderError("invalid API key", 401), "authentication_or_permission"),
        (ProviderError("API key not valid", 400), "authentication_or_permission"),
        (ProviderError("billing account is disabled", 403), "authentication_or_permission"),
    ],
)
def test_safe_provider_error_categories(error: BaseException, expected: str) -> None:
    assert llm_module.provider_error_category(error) == expected


def test_provider_status_code_reads_wrapped_google_sdk_status_without_payload() -> None:
    wrapped = RuntimeError("provider wrapper")
    wrapped.__cause__ = ProviderError("provider failure", 400)
    assert llm_module.provider_status_code(wrapped) == 400


@pytest.mark.asyncio
async def test_model_fallback_handles_temporary_service_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    configured = settings()
    attempted: list[str] = []

    class Model:
        def __init__(self, name: str) -> None:
            self.name = name

        async def ainvoke(self, _prompt: str) -> dict[str, str]:
            attempted.append(self.name)
            if self.name == "primary-model":
                raise ProviderError("temporary service unavailable", 503)
            return {"model": self.name}

    monkeypatch.setattr(llm_module, "get_settings", lambda: configured)
    monkeypatch.setattr(llm_module, "build_chat_model", lambda _settings, model_name: Model(model_name))
    assert await llm_module.GeminiAdapter().ainvoke("safe request") == {"model": "fallback-model"}
    assert attempted == ["primary-model", "fallback-model"]


@pytest.mark.asyncio
async def test_authentication_failures_do_not_try_raw_or_fallback_models(monkeypatch: pytest.MonkeyPatch) -> None:
    configured = settings()
    attempted: list[str] = []

    class Model:
        def __init__(self, name: str) -> None:
            self.name = name

        async def ainvoke(self, _prompt: str) -> Any:
            attempted.append(self.name)
            raise ProviderError("invalid API key", 401)

    monkeypatch.setattr(llm_module, "get_settings", lambda: configured)
    monkeypatch.setattr(llm_module, "build_chat_model", lambda _settings, model_name: Model(model_name))
    with pytest.raises(ProviderError):
        await llm_module.GeminiAdapter().ainvoke("safe request")

    assert attempted == ["primary-model"]
    diagnostics = llm_module.llm_diagnostics(configured)
    assert diagnostics["last_model_call_category"] == "authentication_or_permission"
    assert diagnostics["fallback_model_attempted"] is False


@pytest.mark.asyncio
async def test_structured_authentication_failure_does_not_retry_raw(monkeypatch: pytest.MonkeyPatch) -> None:
    configured = settings()
    raw_calls = 0

    class StructuredRunner:
        async def ainvoke(self, _prompt: str) -> Any:
            raise ProviderError("invalid API key", 401)

    class Model:
        def with_structured_output(self, schema: type[Any], method: str, include_raw: bool) -> StructuredRunner:
            assert schema is Department
            assert method == "json_schema"
            assert include_raw is True
            return StructuredRunner()

        async def ainvoke(self, _prompt: str) -> Any:
            nonlocal raw_calls
            raw_calls += 1
            return "should not run"

    monkeypatch.setattr(llm_module, "get_settings", lambda: configured)
    monkeypatch.setattr(llm_module, "build_chat_model", lambda _settings, _model_name: Model())
    with pytest.raises(ProviderError):
        await llm_module.GeminiAdapter().ainvoke_structured("safe schema request", Department)

    assert raw_calls == 0
    diagnostics = llm_module.llm_diagnostics(configured)
    assert diagnostics["last_model_call_invocation"] == "structured"
    assert diagnostics["fallback_model_attempted"] is False
