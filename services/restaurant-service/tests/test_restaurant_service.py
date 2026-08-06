from fastapi.testclient import TestClient
from src.main import app
from src.domain.restaurant import ReservationStatus

client = TestClient(app)


def test_search_restaurants():
    response = client.get("/v1/restaurants")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert data["total"] >= 4
    
    # Filter by cuisine
    french_res = client.get("/v1/restaurants?cuisine_type=French")
    assert french_res.status_code == 200
    assert french_res.json()["total"] >= 1
    assert french_res.json()["items"][0]["cuisine_type"] == "French"


def test_get_restaurant_by_id():
    response = client.get("/v1/restaurants/rest-001")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "rest-001"
    assert data["name"] == "Le Petit Bistro"

    # Non-existent restaurant
    not_found = client.get("/v1/restaurants/rest-999")
    assert not_found.status_code == 404


def test_check_availability():
    payload = {
        "party_size": 4,
        "booking_time": "2026-08-10T19:00:00"
    }
    response = client.post("/v1/restaurants/rest-001/availability", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    assert data["restaurant_id"] == "rest-001"


def test_reservation_lifecycle_and_idempotency():
    booking_time = "2026-08-12T18:30:00"
    create_payload = {
        "user_id": "usr-123",
        "restaurant_id": "rest-001",
        "party_size": 2,
        "booking_time": booking_time,
        "special_requests": "Window table please",
        "idempotency_key": "idemp-key-test-001"
    }

    # 1. Create reservation
    res1 = client.post("/v1/reservations", json=create_payload)
    assert res1.status_code == 201
    data1 = res1.json()
    res_id = data1["id"]
    assert data1["status"] == ReservationStatus.CONFIRMED.value
    assert data1["restaurant_name"] == "Le Petit Bistro"

    # 2. Idempotency test - same idempotency key returns exact same reservation
    res2 = client.post("/v1/reservations", json=create_payload)
    assert res2.status_code == 201
    assert res2.json()["id"] == res_id

    # 3. Get reservation details
    get_res = client.get(f"/v1/reservations/{res_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == res_id

    # 4. Update reservation
    update_payload = {
        "party_size": 4,
        "special_requests": "Quiet corner table"
    }
    updated_res = client.put(f"/v1/reservations/{res_id}", json=update_payload)
    assert updated_res.status_code == 200
    assert updated_res.json()["party_size"] == 4
    assert updated_res.json()["status"] == ReservationStatus.MODIFIED.value

    # 5. Cancel reservation
    cancelled_res = client.delete(f"/v1/reservations/{res_id}")
    assert cancelled_res.status_code == 200
    assert cancelled_res.json()["status"] == ReservationStatus.CANCELLED.value
