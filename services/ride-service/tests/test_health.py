from fastapi.testclient import TestClient

from src.main import app


def test_health_endpoints() -> None:
    client = TestClient(app)
    assert client.get("/health/live").json()["data"]["status"] == "live"
    assert client.get("/health/ready").json()["data"]["status"] == "ready"
