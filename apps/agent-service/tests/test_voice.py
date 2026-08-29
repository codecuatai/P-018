import pytest
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)

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
