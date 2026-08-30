from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import src.api.voice as voice_module
from fastapi.testclient import TestClient
from google.genai import types as genai_types
from src.main import app

client = TestClient(app)


def test_google_genai_text_part_uses_installed_keyword_only_contract() -> None:
    part = genai_types.Part.from_text(text="transcribe this")
    assert part.text == "transcribe this"


@pytest.mark.asyncio
async def test_speech_to_text_uses_configured_model_and_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    attempts: list[str] = []
    successes: list[str] = []

    class FakeUpload:
        content_type = "audio/webm"
        filename = "test.webm"

        async def read(self) -> bytes:
            return b"audio"

    class FakeModels:
        async def generate_content(self, *, model: str, contents: object) -> object:
            del contents
            attempts.append(model)
            if model == "primary-model":
                error = RuntimeError("model unavailable")
                error.status_code = 404
                raise error
            return SimpleNamespace(text="xin chao")

    class FakeClient:
        def __init__(self, *, api_key: str) -> None:
            del api_key
            self.aio = SimpleNamespace(models=FakeModels())

    settings = SimpleNamespace(
        gemini_api_key="test-key",
        gemini_model="primary-model",
        gemini_fallback_model="fallback-model",
        api_keys=[],
    )
    monkeypatch.setattr(voice_module, "get_settings", lambda: settings)
    monkeypatch.setattr(voice_module.KEY_POOL, "refresh_if_needed", AsyncMock())
    monkeypatch.setattr(voice_module.KEY_POOL, "get_keys_for_invocation", lambda _settings: ["test-key"])
    monkeypatch.setattr(voice_module.KEY_POOL, "mark_key_success", lambda key: successes.append(key))
    monkeypatch.setattr(voice_module.KEY_POOL, "mark_key_failure", lambda _key, _category: None)
    monkeypatch.setattr(voice_module.genai, "Client", FakeClient)

    result = await voice_module.speech_to_text(FakeUpload(), "actor-1")

    assert result.text == "xin chao"
    assert attempts == ["primary-model", "fallback-model"]
    assert successes == ["test-key"]

def test_speech_to_text_no_auth():
    """Missing auth headers should return 401 (require_internal_auth)."""
    response = client.post(
        "/api/v1/voice/speech-to-text",
        files={"file": ("test.webm", b"dummy audio content", "audio/webm")}
    )
    assert response.status_code == 401

def test_speech_to_text_missing_actor():
    """Valid service token but missing X-Actor-Id should return 401."""
    import os
    token = os.environ.get("INTERNAL_SERVICE_TOKEN", "")
    if not token:
        pytest.skip("INTERNAL_SERVICE_TOKEN not set in test env")
    response = client.post(
        "/api/v1/voice/speech-to-text",
        headers={
            "x-internal-service-token": token,
        },
        files={"file": ("test.webm", b"dummy audio content", "audio/webm")}
    )
    assert response.status_code == 401
    body = response.json()
    assert body["detail"]["code"] == "ACTOR_REQUIRED"

def test_speech_to_text_empty_file():
    """Empty audio file should return 400."""
    import os
    token = os.environ.get("INTERNAL_SERVICE_TOKEN", "")
    if not token:
        pytest.skip("INTERNAL_SERVICE_TOKEN not set in test env")
    response = client.post(
        "/api/v1/voice/speech-to-text",
        headers={
            "x-internal-service-token": token,
            "x-actor-id": "test-user",
        },
        files={"file": ("test.webm", b"", "audio/webm")}
    )
    assert response.status_code == 400

def test_speech_to_text_invalid_mime():
    """Non-audio MIME type should return 415."""
    import os
    token = os.environ.get("INTERNAL_SERVICE_TOKEN", "")
    if not token:
        pytest.skip("INTERNAL_SERVICE_TOKEN not set in test env")
    response = client.post(
        "/api/v1/voice/speech-to-text",
        headers={
            "x-internal-service-token": token,
            "x-actor-id": "test-user",
        },
        files={"file": ("test.txt", b"not audio", "text/plain")}
    )
    assert response.status_code == 415
