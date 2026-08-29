import os
from datetime import datetime

os.environ.setdefault("SERVICE_PORT", "8102")
os.environ.setdefault("DATABASE_URL", "sqlite:///./.test-restaurant.db")
os.environ.setdefault("INTERNAL_SERVICE_TOKEN", "test-token")

from fastapi.testclient import TestClient
from src.application.restaurant_service import RestaurantApplicationService
from src.infrastructure.database import Base, RestaurantRow, build_engine
from src.main import app
from src.repositories.restaurant_repository import RestaurantRepository

engine = build_engine(os.environ["DATABASE_URL"])
Base.metadata.drop_all(engine)
Base.metadata.create_all(engine)
with engine.begin() as connection:
    connection.execute(
        RestaurantRow.__table__.insert(),
        [
            {
                "id": "rest-001",
                "name": "Le Petit Bistro",
                "location": "District 1, Ho Chi Minh City",
                "cuisine_type": "French",
                "budget_range": "$$$",
                "rating": 4.8,
                "timezone": "Asia/Ho_Chi_Minh",
                "active": True,
            },
            {
                "id": "rest-002",
                "name": "Sakura Sushi House",
                "location": "District 3, Ho Chi Minh City",
                "cuisine_type": "Japanese",
                "budget_range": "$$",
                "rating": 4.6,
                "timezone": "Asia/Ho_Chi_Minh",
                "active": True,
            },
            {
                "id": "rest-003",
                "name": "Phở & Trà Heritage",
                "location": "Hoan Kiem, Hanoi",
                "cuisine_type": "Vietnamese",
                "budget_range": "$",
                "rating": 4.9,
                "timezone": "Asia/Ho_Chi_Minh",
                "active": True,
            },
            {
                "id": "rest-004",
                "name": "Trattoria Bella Italia",
                "location": "Tay Ho, Hanoi",
                "cuisine_type": "Italian",
                "budget_range": "$$$",
                "rating": 4.7,
                "timezone": "Asia/Ho_Chi_Minh",
                "active": True,
            },
        ],
    )
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
    hanoi_res = client.get("/v1/restaurants?location=Hà Nội", headers=AUTH)
    assert hanoi_res.status_code == 200
    assert len(hanoi_res.json()["data"]["items"]) >= 2


def test_consumer_discovery_searches_authoritative_fields_and_hides_only_placeholders():
    with engine.begin() as connection:
        connection.execute(
            RestaurantRow.__table__.insert(),
            [
                {
                    "id": "rest-hotpot-authoritative",
                    "name": "Lẩu Gà Hồ Tây",
                    "location": "Hà Nội",
                    "cuisine_type": "Vietnamese",
                    "budget_range": "$$",
                    "rating": 4.5,
                    "timezone": "Asia/Ho_Chi_Minh",
                    "active": True,
                    "description": "Nhà hàng lẩu gia đình",
                    "provenance_json": '{"catalog":{"cuisine_tags":["hotpot"]}}',
                },
                {
                    "id": "rest-hotpot-placeholder",
                    "name": "Nhà hàng OSM #999999",
                    "location": "Hà Nội",
                    "cuisine_type": "Vietnamese",
                    "budget_range": "$$",
                    "rating": 4.0,
                    "timezone": "Asia/Ho_Chi_Minh",
                    "active": True,
                    "description": "lẩu",
                    "provenance_json": None,
                },
            ],
        )

    response = client.get(
        "/v1/restaurants?location=Hà%20Nội&cuisine_type=lau",
        headers=AUTH,
    )

    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert "rest-hotpot-authoritative" in {item["id"] for item in items}
    assert all(not item["name"].startswith("Nhà hàng OSM #") for item in items)


def test_get_restaurant_by_id():
    response = client.get("/v1/restaurants/rest-001", headers=AUTH)
    assert response.status_code == 200
    assert response.json()["data"]["name"] == "Le Petit Bistro"
    assert client.get("/v1/restaurants/rest-999", headers=AUTH).status_code == 404


def test_check_availability():
    payload = {"party_size": 4, "start_at": "2030-08-10T19:00:00+07:00", "duration_minutes": 120}
    response = client.post("/v1/restaurants/rest-001/availability", json=payload, headers=AUTH)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["available"] is True
    assert data["snapshot_id"].startswith("availability:rest-001:")
    assert data["resource_version"].startswith("availability-v1:")
    assert data["snapshot_id"] != data["resource_version"]
    observed_at = datetime.fromisoformat(data["observed_at"])
    expires_at = datetime.fromisoformat(data["expires_at"])
    assert (expires_at - observed_at).total_seconds() == 30


def test_check_availability_reports_past_start():
    payload = {"party_size": 3, "start_at": "2020-08-10T08:00:00+07:00", "duration_minutes": 120}
    response = client.post("/v1/restaurants/rest-001/availability", json=payload, headers=AUTH)
    assert response.status_code == 422
    assert response.json()["code"] == "PAST_START"


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
    assert read.json()["data"]["address"] == "District 1, Ho Chi Minh City"
    assert read.json()["data"]["restaurant"] == {
        "name": "Le Petit Bistro",
        "address": "District 1, Ho Chi Minh City",
        "city": None,
        "district": None,
        "ward": None,
        "cuisine": "French",
        "rating": 4.8,
        "price_level": "$$$",
        "image_url": None,
    }


def test_cancel_hold_releases_capacity_and_replays_idempotently():
    payload = {"restaurant_id": "rest-001", "party_size": 8, "start_at": "2030-08-13T18:30:00+07:00", "duration_minutes": 120}
    hold = client.post("/v1/reservation-holds", json=payload, headers={**AUTH, "Idempotency-Key": "hold-cancel-001"})
    assert hold.status_code == 201
    hold_id = hold.json()["data"]["id"]

    unavailable = client.post(
        "/v1/restaurants/rest-001/availability",
        json=payload,
        headers=AUTH,
    )
    assert unavailable.status_code == 200
    assert unavailable.json()["data"]["available"] is False

    forbidden = client.post(
        f"/v1/reservation-holds/{hold_id}/cancel",
        headers={"X-Internal-Service-Token": "test-token", "X-Actor-Id": "usr-other", "Idempotency-Key": "hold-cancel-other"},
    )
    assert forbidden.status_code == 404

    cancelled = client.post(
        f"/v1/reservation-holds/{hold_id}/cancel",
        headers={**AUTH, "Idempotency-Key": "hold-cancel-commit-001"},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["data"]["status"] == "CANCELLED"
    assert cancelled.json()["data"]["resource_version"] == 2

    replay = client.post(
        f"/v1/reservation-holds/{hold_id}/cancel",
        headers={**AUTH, "Idempotency-Key": "hold-cancel-commit-001"},
    )
    assert replay.status_code == 200
    assert replay.json()["data"] == cancelled.json()["data"]

    available_again = client.post(
        "/v1/restaurants/rest-001/availability",
        json=payload,
        headers=AUTH,
    )
    assert available_again.status_code == 200
    assert available_again.json()["data"]["available"] is True


def test_update_and_cancel_reservation_are_actor_scoped_and_idempotent():
    payload = {"restaurant_id": "rest-001", "party_size": 2, "start_at": "2030-08-14T18:30:00+07:00", "duration_minutes": 120}
    hold = client.post("/v1/reservation-holds", json=payload, headers={**AUTH, "Idempotency-Key": "hold-update-001"})
    assert hold.status_code == 201
    reservation = client.post(
        "/v1/reservations",
        json={**payload, "hold_id": hold.json()["data"]["id"]},
        headers={**AUTH, "Idempotency-Key": "reservation-update-001"},
    )
    assert reservation.status_code == 201
    reservation_id = reservation.json()["data"]["id"]

    update = client.patch(
        f"/v1/reservations/{reservation_id}",
        json={"party_size": 3, "start_at": "2030-08-14T19:00:00+07:00", "special_requests": "Quiet table"},
        headers={**AUTH, "Idempotency-Key": "reservation-modify-001"},
    )
    assert update.status_code == 200
    assert update.json()["data"]["status"] == "MODIFIED"
    replay = client.patch(
        f"/v1/reservations/{reservation_id}",
        json={"party_size": 3, "start_at": "2030-08-14T19:00:00+07:00", "special_requests": "Quiet table"},
        headers={**AUTH, "Idempotency-Key": "reservation-modify-001"},
    )
    assert replay.status_code == 200
    assert replay.json()["data"]["resource_version"] == update.json()["data"]["resource_version"]

    cancelled = client.post(
        f"/v1/reservations/{reservation_id}/cancel",
        headers={**AUTH, "Idempotency-Key": "reservation-cancel-001"},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["data"]["status"] == "CANCELLED"


def create_direct_reservation(start_at: str, key: str, actor_headers=None, special_requests: str | None = None, duration_minutes: int = 180):
    headers = actor_headers or AUTH
    response = client.post(
        "/v1/reservations",
        json={
            "restaurant_id": "rest-001",
            "party_size": 2,
            "start_at": start_at,
            "duration_minutes": duration_minutes,
            "special_requests": special_requests,
        },
        headers={**headers, "Idempotency-Key": key},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def test_patch_party_size_only_preserves_duration_and_omitted_special_requests():
    reservation = create_direct_reservation("2030-09-01T18:00:00+07:00", "patch-preserve-001", special_requests="window seat")

    response = client.patch(
        f"/v1/reservations/{reservation['id']}",
        json={"party_size": 4},
        headers={**AUTH, "Idempotency-Key": "patch-preserve-002"},
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["party_size"] == 4
    assert data["start_at"] == "2030-09-01T11:00:00+00:00"
    assert data["end_at"] == "2030-09-01T14:00:00+00:00"
    assert data["special_requests"] == "window seat"


def test_patch_start_only_preserves_existing_duration():
    reservation = create_direct_reservation("2030-09-02T18:00:00+07:00", "patch-start-001", special_requests="window seat")

    response = client.patch(
        f"/v1/reservations/{reservation['id']}",
        json={"start_at": "2030-09-02T19:00:00+07:00"},
        headers={**AUTH, "Idempotency-Key": "patch-start-002"},
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["start_at"] == "2030-09-02T12:00:00+00:00"
    assert data["end_at"] == "2030-09-02T15:00:00+00:00"
    assert data["special_requests"] == "window seat"


def test_patch_explicit_null_clears_special_requests():
    reservation = create_direct_reservation("2030-09-03T18:00:00+07:00", "patch-null-001", special_requests="window seat")

    response = client.patch(
        f"/v1/reservations/{reservation['id']}",
        json={"special_requests": None},
        headers={**AUTH, "Idempotency-Key": "patch-null-002"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["data"]["special_requests"] is None


def test_patch_empty_body_is_rejected_without_side_effect():
    reservation = create_direct_reservation("2030-09-03T20:00:00+07:00", "patch-empty-001", special_requests="window seat")

    response = client.patch(
        f"/v1/reservations/{reservation['id']}",
        json={},
        headers={**AUTH, "Idempotency-Key": "patch-empty-002"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "NO_FIELDS_TO_UPDATE"
    read = client.get(f"/v1/reservations/{reservation['id']}", headers=AUTH)
    assert read.status_code == 200
    assert read.json()["data"]["resource_version"] == reservation["resource_version"]


def test_idempotency_key_accepts_one_and_255_characters_but_rejects_256():
    payload = {"restaurant_id": "rest-001", "party_size": 2, "start_at": "2030-09-07T18:00:00+07:00", "duration_minutes": 120}
    one = client.post(
        "/v1/reservation-holds",
        json=payload,
        headers={**AUTH, "Idempotency-Key": "a"},
    )
    max_length = client.post(
        "/v1/reservation-holds",
        json={**payload, "start_at": "2030-09-07T20:00:00+07:00"},
        headers={**AUTH, "Idempotency-Key": "b" * 255},
    )
    too_long = client.post(
        "/v1/reservation-holds",
        json={**payload, "start_at": "2030-09-07T22:00:00+07:00"},
        headers={**AUTH, "Idempotency-Key": "c" * 256},
    )

    assert one.status_code == 201, one.text
    assert max_length.status_code == 201, max_length.text
    assert too_long.status_code == 422
    assert too_long.json()["code"] == "IDEMPOTENCY_KEY_INVALID"


def test_update_idempotency_survives_later_update_and_changed_payload_conflicts():
    reservation = create_direct_reservation("2030-09-04T18:00:00+07:00", "patch-replay-001", special_requests="original")
    first = client.patch(
        f"/v1/reservations/{reservation['id']}",
        json={"party_size": 3},
        headers={**AUTH, "Idempotency-Key": "patch-replay-u1"},
    )
    second = client.patch(
        f"/v1/reservations/{reservation['id']}",
        json={"start_at": "2030-09-04T19:00:00+07:00"},
        headers={**AUTH, "Idempotency-Key": "patch-replay-u2"},
    )
    assert first.status_code == second.status_code == 200

    replay_first = client.patch(
        f"/v1/reservations/{reservation['id']}",
        json={"party_size": 3},
        headers={**AUTH, "Idempotency-Key": "patch-replay-u1"},
    )
    assert replay_first.status_code == 200
    assert replay_first.json()["data"]["resource_version"] == first.json()["data"]["resource_version"]
    assert replay_first.json()["data"]["start_at"] == first.json()["data"]["start_at"]

    changed = client.patch(
        f"/v1/reservations/{reservation['id']}",
        json={"party_size": 4},
        headers={**AUTH, "Idempotency-Key": "patch-replay-u1"},
    )
    assert changed.status_code == 409


def test_create_record_replays_after_update_and_cancel_record_replays():
    reservation = create_direct_reservation("2030-09-05T18:00:00+07:00", "lifecycle-create-001")
    updated = client.patch(
        f"/v1/reservations/{reservation['id']}",
        json={"party_size": 3},
        headers={**AUTH, "Idempotency-Key": "lifecycle-update-001"},
    )
    cancelled = client.post(
        f"/v1/reservations/{reservation['id']}/cancel",
        headers={**AUTH, "Idempotency-Key": "lifecycle-cancel-001"},
    )
    assert updated.status_code == cancelled.status_code == 200

    create_replay = client.post(
        "/v1/reservations",
        json={
            "restaurant_id": "rest-001",
            "party_size": 2,
            "start_at": "2030-09-05T18:00:00+07:00",
            "duration_minutes": 180,
            "special_requests": None,
        },
        headers={**AUTH, "Idempotency-Key": "lifecycle-create-001"},
    )
    cancel_replay = client.post(
        f"/v1/reservations/{reservation['id']}/cancel",
        headers={**AUTH, "Idempotency-Key": "lifecycle-cancel-001"},
    )
    assert create_replay.status_code == 201
    assert create_replay.json()["data"]["id"] == reservation["id"]
    assert cancel_replay.status_code == 200
    assert cancel_replay.json()["data"] == cancelled.json()["data"]


def test_same_client_key_is_scoped_to_actor():
    other_actor = {"X-Internal-Service-Token": "test-token", "X-Actor-Id": "usr-456"}
    first = create_direct_reservation("2030-09-06T18:00:00+07:00", "actor-scoped-001")
    second_response = client.post(
        "/v1/reservations",
        json={
            "restaurant_id": "rest-002",
            "party_size": 2,
            "start_at": "2030-09-06T18:00:00+07:00",
            "duration_minutes": 180,
        },
        headers={**other_actor, "Idempotency-Key": "actor-scoped-001"},
    )
    assert second_response.status_code == 201, second_response.text
    assert second_response.json()["data"]["id"] != first["id"]
