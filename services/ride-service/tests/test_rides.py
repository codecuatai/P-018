from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from src.domain.ride import normalized_hash
from src.infrastructure.models import BookingRow, QuoteRow, RideDriverRow, RideTrackingEventRow

ACTOR = "user_ride_test"


def _headers(*, actor: str = ACTOR, key: str | None = None) -> dict[str, str]:
    headers = {
        "X-Internal-Service-Token": "test-token",
        "X-Actor-Id": actor,
    }
    if key:
        headers["Idempotency-Key"] = key
    return headers


def _create_quote(client: TestClient, *, key: str = "quote-key", with_coordinates: bool = True) -> dict:
    payload = {
        "pickup_address": "VinUni, Gia Lam",
        "dropoff_address": "Ho Guom, Hoan Kiem",
        "vehicle_type": "CAR_4",
        "promo_code": "SAVE5000",
    }
    if with_coordinates:
        payload.update({"pickup_latitude": 21.0285, "pickup_longitude": 105.8048, "dropoff_latitude": 21.0301, "dropoff_longitude": 105.8122})
    response = client.post(
        "/v1/quotes",
        headers=_headers(key=key),
        json=payload,
    )
    assert response.status_code == 201
    return response.json()["data"]


def _confirmation(action: str, payload: dict, quote: dict) -> dict:
    now = datetime.now(UTC)
    return {
        "confirmation_id": f"confirmation_{uuid4().hex}",
        "actor_id": ACTOR,
        "action": action,
        "payload_hash": normalized_hash(payload),
        "quote_version": quote["quote_version"],
        "amount": quote["amount"],
        "currency": quote["currency"],
        "issued_at": (now - timedelta(seconds=5)).isoformat(),
        "expires_at": (now + timedelta(minutes=5)).isoformat(),
    }


def _prepare(client: TestClient, quote: dict) -> dict:
    payload = {
        "action": "ride.booking.prepare",
        "actor_id": ACTOR,
        "quote_id": quote["id"],
        "quote_version": quote["quote_version"],
        "amount": quote["amount"],
        "currency": quote["currency"],
    }
    response = client.post(
        "/v1/bookings:prepare",
        headers=_headers(key="prepare-key"),
        json={
            "quote_id": quote["id"],
            "confirmation": _confirmation("ride.booking.prepare", payload, quote),
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def _confirm(client: TestClient, quote: dict, booking: dict, *, key: str = "confirm-key") -> dict:
    payment_reference = f"payment_{key}"
    bound_payload = {
        "action": "ride.booking.confirm",
        "actor_id": ACTOR,
        "booking_id": booking["id"],
        "quote_id": quote["id"],
        "quote_version": quote["quote_version"],
        "amount": quote["amount"],
        "currency": quote["currency"],
        "payment_reference": payment_reference,
    }
    response = client.post(
        f"/v1/bookings/{booking['id']}:confirm",
        headers=_headers(key=key),
        json={
            "payment_reference": payment_reference,
            "confirmation": _confirmation("ride.booking.confirm", bound_payload, quote),
        },
    )
    assert response.status_code == 200
    return response.json()["data"]


def _set_tracking_start(client: TestClient, booking_id: str, *, seconds_ago: int) -> None:
    engine = getattr(client, "ride_engine")
    started_at = datetime.now(UTC) - timedelta(seconds=seconds_ago)
    with Session(engine) as session:
        booking = session.get(BookingRow, booking_id)
        assert booking is not None
        booking.tracking_started_at = started_at
        session.commit()


def test_internal_auth_and_idempotency_headers_are_required(client: TestClient) -> None:
    missing_auth = client.post("/v1/quotes", json={})
    assert missing_auth.status_code == 401
    assert missing_auth.json()["code"] == "INTERNAL_AUTH_FAILED"
    assert "X-Correlation-Id" in missing_auth.headers

    missing_key = client.post(
        "/v1/quotes",
        headers=_headers(),
        json={
            "pickup_address": "VinUni",
            "dropoff_address": "Ho Guom",
            "vehicle_type": "BIKE",
        },
    )
    assert missing_key.status_code == 400
    assert missing_key.json()["code"] == "IDEMPOTENCY_KEY_REQUIRED"


def test_quote_is_deterministic_and_idempotent(client: TestClient) -> None:
    first = _create_quote(client)
    replay = _create_quote(client)
    assert replay == first
    assert first["currency"] == "VND"
    assert first["status"] == "QUOTE_CREATED"
    assert first["tariff_version"] == "TEST_2026_V1"

    conflict = client.post(
        "/v1/quotes",
        headers=_headers(key="quote-key"),
        json={
            "pickup_address": "VinUni, Gia Lam",
            "dropoff_address": "Noi Bai Airport",
            "vehicle_type": "CAR_4",
        },
    )
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "IDEMPOTENCY_CONFLICT"


def test_two_confirmations_prepare_then_assign_driver(client: TestClient) -> None:
    quote = _create_quote(client)
    booking = _prepare(client, quote)
    assert booking["status"] == "AWAITING_CONFIRMATION"
    assert booking["driver"] is None
    assert booking["payment_reference"] is None

    payment_reference = "payment_sandbox_001"
    bound_payload = {
        "action": "ride.booking.confirm",
        "actor_id": ACTOR,
        "booking_id": booking["id"],
        "quote_id": quote["id"],
        "quote_version": quote["quote_version"],
        "amount": quote["amount"],
        "currency": quote["currency"],
        "payment_reference": payment_reference,
    }
    request = {
        "payment_reference": payment_reference,
        "confirmation": _confirmation("ride.booking.confirm", bound_payload, quote),
    }
    confirmed = client.post(
        f"/v1/bookings/{booking['id']}:confirm",
        headers=_headers(key="confirm-key"),
        json=request,
    )
    assert confirmed.status_code == 200
    result = confirmed.json()["data"]
    assert result["status"] == "DRIVER_ASSIGNED"
    assert result["resource_version"] == 3
    assert result["payment_reference"] == payment_reference
    assert result["driver"]["id"].startswith("driver_simulated")
    assert client.get(f"/v1/quotes/{quote['id']}", headers=_headers()).json()["data"]["status"] == "CONSUMED"

    replay = client.post(
        f"/v1/bookings/{booking['id']}:confirm",
        headers=_headers(key="confirm-key"),
        json=request,
    )
    assert replay.status_code == 200
    assert replay.json()["data"] == result


def test_confirmation_is_payload_bound_and_one_time(client: TestClient) -> None:
    quote = _create_quote(client)
    expected = {
        "action": "ride.booking.prepare",
        "actor_id": ACTOR,
        "quote_id": quote["id"],
        "quote_version": quote["quote_version"],
        "amount": quote["amount"],
        "currency": quote["currency"],
    }
    evidence = _confirmation("ride.booking.prepare", expected, quote)
    first = client.post(
        "/v1/bookings:prepare",
        headers=_headers(key="prepare-first"),
        json={"quote_id": quote["id"], "confirmation": evidence},
    )
    assert first.status_code == 201

    reuse = client.post(
        "/v1/bookings:prepare",
        headers=_headers(key="prepare-reuse"),
        json={"quote_id": quote["id"], "confirmation": evidence},
    )
    assert reuse.status_code == 409
    assert reuse.json()["code"] == "CONFIRMATION_ALREADY_USED"

    altered = dict(evidence)
    altered["confirmation_id"] = "confirmation_altered"
    altered["amount"] += 1
    mismatch = client.post(
        "/v1/bookings:prepare",
        headers=_headers(key="prepare-altered"),
        json={"quote_id": quote["id"], "confirmation": altered},
    )
    assert mismatch.status_code == 409
    assert mismatch.json()["code"] == "CONFIRMATION_MISMATCH"


def test_actor_cannot_read_another_actors_quote(client: TestClient) -> None:
    quote = _create_quote(client)
    response = client.get(
        f"/v1/quotes/{quote['id']}",
        headers=_headers(actor="different-user"),
    )
    assert response.status_code == 404
    assert response.json()["code"] == "QUOTE_NOT_FOUND"


def test_cancellation_is_bound_to_current_resource_version(client: TestClient) -> None:
    quote = _create_quote(client)
    booking = _prepare(client, quote)
    bound_payload = {
        "action": "ride.booking.cancel",
        "actor_id": ACTOR,
        "booking_id": booking["id"],
        "quote_version": quote["quote_version"],
        "amount": quote["amount"],
        "currency": quote["currency"],
        "resource_version": booking["resource_version"],
    }
    response = client.post(
        f"/v1/bookings/{booking['id']}:cancel",
        headers=_headers(key="cancel-key"),
        json={
            "confirmation": _confirmation("ride.booking.cancel", bound_payload, quote),
        },
    )
    assert response.status_code == 200
    result = response.json()["data"]
    assert result["status"] == "CANCELLED"
    assert result["resource_version"] == booking["resource_version"] + 1


def test_v2_quote_keeps_coordinate_route_snapshot_and_tariff(client: TestClient) -> None:
    response = client.post(
        "/v1/quotes",
        headers=_headers(key="coordinate-quote"),
        json={
            "pickup_address": "VinUni",
            "dropoff_address": "Ho Guom",
            "vehicle_type": "CAR_4",
            "pickup_latitude": 21.0001,
            "pickup_longitude": 105.9001,
            "dropoff_latitude": 21.0285,
            "dropoff_longitude": 105.8048,
        },
    )
    assert response.status_code == 201
    quote = response.json()["data"]
    assert quote["route_provider"] == "deterministic-haversine"
    assert quote["route_distance_meters"] > 0
    assert quote["route_snapshot_hash"]
    assert quote["tariff_snapshot"]["version"] == quote["tariff_version"]


def test_tracking_is_deterministic_and_never_fakes_driver_coordinates(client: TestClient) -> None:
    quote = _create_quote(client, key="tracking-quote", with_coordinates=False)
    booking = _prepare(client, quote)
    payment_reference = "payment_tracking"
    bound_payload = {
        "action": "ride.booking.confirm",
        "actor_id": ACTOR,
        "booking_id": booking["id"],
        "quote_id": quote["id"],
        "quote_version": quote["quote_version"],
        "amount": quote["amount"],
        "currency": quote["currency"],
        "payment_reference": payment_reference,
    }
    confirmed = client.post(
        f"/v1/bookings/{booking['id']}:confirm",
        headers=_headers(key="tracking-confirm"),
        json={"payment_reference": payment_reference, "confirmation": _confirmation("ride.booking.confirm", bound_payload, quote)},
    )
    assert confirmed.status_code == 200
    first = client.get(f"/v1/bookings/{booking['id']}/tracking", headers=_headers())
    second = client.get(f"/v1/bookings/{booking['id']}/tracking", headers=_headers())
    assert first.status_code == 200
    assert first.json()["data"] == second.json()["data"]
    assert first.json()["data"]["status"] == "NO_DRIVER"
    assert first.json()["data"]["driver_location"] is None


def test_ride_lifecycle_persists_every_authoritative_transition(client: TestClient) -> None:
    quote = _create_quote(client, key="lifecycle-quote")
    booking = _prepare(client, quote)
    assert booking["status"] == "AWAITING_CONFIRMATION"
    assert client.get(f"/v1/quotes/{quote['id']}", headers=_headers()).json()["data"]["status"] == "AWAITING_CONFIRMATION"

    confirmed = _confirm(client, quote, booking, key="lifecycle-confirm")
    assert confirmed["status"] == "DRIVER_ASSIGNED"
    assigned_driver_id = confirmed["driver"]["id"]
    engine = getattr(client, "ride_engine")
    with Session(engine) as session:
        persisted = session.get(BookingRow, confirmed["id"])
        assert persisted is not None
        assert persisted.driver_snapshot["id"] == assigned_driver_id
    eta_seconds = confirmed["driver"]["eta_seconds"]
    route_seconds = quote["route_duration_seconds"]

    expected_states = [
        (2, "DRIVER_TO_PICKUP"),
        (eta_seconds + 2, "DRIVER_ARRIVED"),
        (eta_seconds + 62, "IN_PROGRESS"),
        (eta_seconds + 62 + route_seconds + 2, "COMPLETED"),
    ]
    for seconds_ago, expected_status in expected_states:
        _set_tracking_start(client, confirmed["id"], seconds_ago=seconds_ago)
        response = client.get(f"/v1/bookings/{confirmed['id']}/tracking", headers=_headers())
        assert response.status_code == 200
        assert response.json()["data"]["status"] == expected_status
        assert client.get(f"/v1/bookings/{confirmed['id']}", headers=_headers()).json()["data"]["status"] == expected_status

    with Session(engine) as session:
        events = session.query(RideTrackingEventRow).filter_by(booking_id=confirmed["id"]).order_by(RideTrackingEventRow.occurred_at, RideTrackingEventRow.id).all()
        assert [event.status for event in events] == [
            "AWAITING_CONFIRMATION",
            "SEARCHING_DRIVER",
            "DRIVER_ASSIGNED",
            "DRIVER_TO_PICKUP",
            "DRIVER_ARRIVED",
            "IN_PROGRESS",
            "COMPLETED",
        ]
        driver = session.get(RideDriverRow, assigned_driver_id)
        assert driver is not None
        assert driver.availability_status == "AVAILABLE"


def test_expired_quote_is_persisted_and_cannot_be_prepared(client: TestClient) -> None:
    quote = _create_quote(client, key="expired-quote")
    engine = getattr(client, "ride_engine")
    with Session(engine) as session:
        row = session.get(QuoteRow, quote["id"])
        assert row is not None
        row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        session.commit()

    expired = client.get(f"/v1/quotes/{quote['id']}", headers=_headers())
    assert expired.status_code == 200
    assert expired.json()["data"]["status"] == "EXPIRED"
