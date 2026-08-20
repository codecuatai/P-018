import os

os.environ["APP_ENV"] = "test"
os.environ["SERVICE_PORT"] = "8104"
os.environ["DATABASE_URL"] = "postgresql://test"
os.environ["INTERNAL_SERVICE_TOKEN"] = "test-token"
os.environ["PERSISTENCE"] = "memory"

from uuid import uuid4

from fastapi.testclient import TestClient
from src.application.food_service import FoodApplicationService
from src.config import Settings
from src.main import app
from src.repositories.food import InMemoryFoodRepository


def test_update_status_transitions():
    app.state.food_service = FoodApplicationService(InMemoryFoodRepository(), Settings())
    client = TestClient(app)

    actor_id = "test_actor_1"
    headers = {"X-Internal-Service-Token": "test-token", "X-Actor-Id": actor_id, "Idempotency-Key": str(uuid4())}

    response = client.patch(
        "/api/v1/orders/non_existent:status",
        json={"status": "PREPARING"},
        headers=headers,
    )
    assert response.status_code in (404, 403, 409)

    # Missing internal token
    response_no_token = client.patch(
        "/api/v1/orders/non_existent:status",
        json={"status": "PREPARING"},
        headers={"X-Actor-Id": actor_id, "Idempotency-Key": str(uuid4())},
    )
    assert response_no_token.status_code == 401
