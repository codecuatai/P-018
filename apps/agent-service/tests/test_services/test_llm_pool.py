from types import SimpleNamespace

import pytest
import src.services.llm as llm_module
from src.config import Settings


class ProviderError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def test_settings_parses_comma_separated_keys():
    s = Settings(
        app_env="test",
        service_port=8001,
        database_url="postgresql://user:pass@localhost:5432/db",
        internal_service_token="test-token",
        gemini_api_keys=" key1, key2 ,key3, ,key1 ",
        gemini_api_key="",
    )
    assert s.api_keys == ["key1", "key2", "key3"]
    assert s.has_gemini_api_key is True
    # Auto-synced first key for legacy callers
    assert s.gemini_api_key == "key1"


def test_settings_single_key_fallback():
    s = Settings(
        app_env="test",
        service_port=8001,
        database_url="postgresql://user:pass@localhost:5432/db",
        internal_service_token="test-token",
        gemini_api_keys="",
        gemini_api_key="single_key",
    )
    assert s.api_keys == ["single_key"]
    assert s.has_gemini_api_key is True
    assert s.gemini_api_key == "single_key"


def test_settings_merges_both_key_variables():
    s = Settings(
        app_env="test",
        service_port=8001,
        database_url="postgresql://user:pass@localhost:5432/db",
        internal_service_token="test-token",
        gemini_api_keys="key1,key2",
        gemini_api_key="key3,key1",
    )
    assert s.api_keys == ["key1", "key2", "key3"]
    assert s.has_gemini_api_key is True


def test_gemini_key_pool_round_robin_sequence():
    pool = llm_module.GeminiKeyPool()
    settings = SimpleNamespace(api_keys=["k1", "k2", "k3"])

    first = pool.get_keys_for_invocation(settings)
    second = pool.get_keys_for_invocation(settings)
    third = pool.get_keys_for_invocation(settings)
    fourth = pool.get_keys_for_invocation(settings)

    assert first == ["k1", "k2", "k3"]
    assert second == ["k2", "k3", "k1"]
    assert third == ["k3", "k1", "k2"]
    assert fourth == ["k1", "k2", "k3"]


@pytest.mark.asyncio
async def test_adapter_round_robin_distributes_requests_across_keys(monkeypatch: pytest.MonkeyPatch):
    llm_module.KEY_POOL.reset()
    used_keys: list[str] = []

    class MockModel:
        def __init__(self, key: str) -> None:
            self.key = key

        async def ainvoke(self, _prompt: str) -> dict[str, str]:
            used_keys.append(self.key)
            return {"status": "ok", "key": self.key}

    configured = SimpleNamespace(
        api_keys=["keyA", "keyB", "keyC"],
        gemini_api_key="keyA",
        gemini_model="test-model",
        gemini_fallback_model="fallback-model",
        has_gemini_api_key=True,
    )

    monkeypatch.setattr(llm_module, "get_settings", lambda: configured)
    monkeypatch.setattr(
        llm_module,
        "build_chat_model",
        lambda _settings, _model, api_key=None: MockModel(api_key),
    )

    adapter = llm_module.GeminiAdapter()

    res1 = await adapter.ainvoke("msg1")
    res2 = await adapter.ainvoke("msg2")
    res3 = await adapter.ainvoke("msg3")
    res4 = await adapter.ainvoke("msg4")

    assert res1["key"] == "keyA"
    assert res2["key"] == "keyB"
    assert res3["key"] == "keyC"
    assert res4["key"] == "keyA"
    assert used_keys == ["keyA", "keyB", "keyC", "keyA"]


@pytest.mark.asyncio
async def test_adapter_fails_over_to_next_key_on_429_quota_limit(monkeypatch: pytest.MonkeyPatch):
    llm_module.KEY_POOL.reset()
    attempted_keys: list[str] = []

    class QuotaFailoverModel:
        def __init__(self, key: str) -> None:
            self.key = key

        async def ainvoke(self, _prompt: str) -> dict[str, str]:
            attempted_keys.append(self.key)
            if self.key == "key1":
                raise ProviderError("Resource has been exhausted (e.g. check quota)", 429)
            return {"status": "success", "resolved_key": self.key}

    configured = SimpleNamespace(
        api_keys=["key1", "key2", "key3"],
        gemini_api_key="key1",
        gemini_model="test-model",
        gemini_fallback_model="fallback-model",
        has_gemini_api_key=True,
    )

    monkeypatch.setattr(llm_module, "get_settings", lambda: configured)
    monkeypatch.setattr(
        llm_module,
        "build_chat_model",
        lambda _settings, _model, api_key=None: QuotaFailoverModel(api_key),
    )

    adapter = llm_module.GeminiAdapter()
    result = await adapter.ainvoke("test failover")

    assert result["status"] == "success"
    assert result["resolved_key"] == "key2"
    assert attempted_keys == ["key1", "key2"]


def test_diagnostics_includes_key_count_without_leaking_secrets(monkeypatch: pytest.MonkeyPatch):
    configured = SimpleNamespace(
        api_keys=["secret_key_1", "secret_key_2", "secret_key_3"],
        gemini_api_key="secret_key_1",
        gemini_model="gemini-3.5-flash-lite",
        gemini_fallback_model="gemini-3.1-flash-lite",
        has_gemini_api_key=True,
    )
    monkeypatch.setattr(llm_module, "get_settings", lambda: configured)

    diag = llm_module.llm_diagnostics(configured)
    assert diag["keys_configured_count"] == 3
    # Verify no secret text appears anywhere in diagnostics values
    for val in diag.values():
        assert "secret_key" not in str(val)

    config_info = llm_module.get_llm_config()
    assert config_info["api_key_configured"] == "true"
    assert config_info["keys_configured_count"] == "3"
    for val in config_info.values():
        assert "secret_key" not in str(val)
