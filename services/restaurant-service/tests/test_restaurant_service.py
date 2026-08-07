import os

os.environ.setdefault("SERVICE_PORT", "8102")
os.environ.setdefault("DATABASE_URL", "sqlite:///./.test-restaurant.db")
os.environ.setdefault("INTERNAL_SERVICE_TOKEN", "test-token")

from fastapi.testclient import TestClient
from src.application.restaurant_service import RestaurantApplicationService
from src.infrastructure.database import Base, build_engine
from src.main import app
from src.repositories.restaurant_repository import RestaurantRepository

engine = build_engine(os.environ["DATABASE_URL"])
Base.metadata.drop_all(engine)
Base.metadata.create_all(engine)
RestaurantRepository(os.environ["DATABASE_URL"]).seed()
app.state.restaurant_service = RestaurantApplicationService(RestaurantRepository(os.environ["DATABASE_URL"]))
client = TestClient(app)
AUTH = {"X-Internal-Service-Token": "test-token", "X-Actor-Id": "usr-123"}


def test_search_restaurants():
    response = client.get("/v1/restaurants", headers=AUTH)
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data["items"]) >= 4
    french_res = client.get("/v1/restaurants?cuisine_type=French", headers=AUTH)
    assert french_res.status_code == 200
    assert french_res.json()["data"]["items"][0]["cuisine_type"] == "French"


def test_get_restaurant_by_id():
    response = client.get("/v1/restaurants/rest-001", headers=AUTH)
    assert response.status_code == 200
    assert response.json()["data"]["name"] == "Le Petit Bistro"
    assert client.get("/v1/restaurants/rest-999", headers=AUTH).status_code == 404


def test_check_availability():
    payload = {"party_size": 4, "start_at": "2030-08-10T19:00:00+07:00", "duration_minutes": 120}
    response = client.post("/v1/restaurants/rest-001/availability", json=payload, headers=AUTH)
    assert response.status_code == 200
    assert response.json()["data"]["available"] is True


def test_hold_reservation_and_idempotency():
    payload = {"restaurant_id": "rest-001", "party_size": 2, "start_at": "2030-08-12T18:30:00+07:00", "duration_minutes": 120}
    hold = client.post("/v1/reservation-holds", json=payload, headers={**AUTH, "Idempotency-Key": "hold-001"})
    assert hold.status_code == 201
    hold_id = hold.json()["data"]["id"]
    reservation_payload = {**payload, "hold_id": hold_id, "special_requests": "Window table please"}
    headers = {**AUTH, "Idempotency-Key": "reservation-001"}
    first = client.post("/v1/reservations", json=reservation_payload, headers=headers)
    assert first.status_code == 201
    reservation_id = first.json()["data"]["id"]
    replay = client.post("/v1/reservations", json=reservation_payload, headers=headers)
    assert replay.status_code == 201
    assert replay.json()["data"]["id"] == reservation_id
    read = client.get(f"/v1/reservations/{reservation_id}", headers=AUTH)
    assert read.status_code == 200
    assert read.json()["data"]["actor_id"] == "usr-123"
