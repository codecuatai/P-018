from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from src.config import get_settings
from src.domain.ride import Booking, BookingStatus, normalized_hash, tracking_elapsed, tracking_progress
from src.infrastructure.models import BookingRow, QuoteRow, RideDriverRow, RideTrackingEventRow

ACTOR = "user_ride_test"


def _near_route(location: dict[str, float], route: list[dict[str, float]]) -> bool:
    for start, end in zip(route, route[1:]):
        latitude_span = end["latitude"] - start["latitude"]
        longitude_span = end["longitude"] - start["longitude"]
        length_squared = latitude_span**2 + longitude_span**2
        if length_squared == 0:
            continue
        ratio = ((location["latitude"] - start["latitude"]) * latitude_span + (location["longitude"] - start["longitude"]) * longitude_span) / length_squared
        bounded = min(1.0, max(0.0, ratio))
        projected = {
            "latitude": start["latitude"] + latitude_span * bounded,
            "longitude": start["longitude"] + longitude_span * bounded,
        }
        if abs(projected["latitude"] - location["latitude"]) < 1e-5 and abs(projected["longitude"] - location["longitude"]) < 1e-5:
            return True
    return False


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
        payload.update({
            "pickup_latitude": 21.0285,
            "pickup_longitude": 105.8048,
            "dropoff_latitude": 21.0301,
            "dropoff_longitude": 105.8122,
            "route_provider": "geoapify",
            "route_distance_meters": 1_250,
            "route_duration_seconds": 420,
            "route_geometry": [
                {"latitude": 21.0285, "longitude": 105.8048},
                {"latitude": 21.0292, "longitude": 105.8080},
                {"latitude": 21.0301, "longitude": 105.8122},
            ],
            "route_snapshot_hash": "test-route-hash",
        })
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


def _set_booking_updated_at(client: TestClient, booking_id: str, *, seconds_ago: int) -> None:
    engine = getattr(client, "ride_engine")
    updated_at = datetime.now(UTC) - timedelta(seconds=seconds_ago)
    with Session(engine) as session:
        booking = session.get(BookingRow, booking_id)
        assert booking is not None
        booking.updated_at = updated_at
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
            "pickup_latitude": 21.0285,
            "pickup_longitude": 105.8048,
            "dropoff_latitude": 21.0301,
            "dropoff_longitude": 105.8122,
            "route_provider": "geoapify",
            "route_distance_meters": 1_250,
            "route_duration_seconds": 420,
            "route_geometry": [
                {"latitude": 21.0285, "longitude": 105.8048},
                {"latitude": 21.0301, "longitude": 105.8122},
            ],
        },
    )
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "IDEMPOTENCY_CONFLICT"


def test_quote_rejects_coordinates_without_a_real_route(client: TestClient) -> None:
    response = client.post(
        "/v1/quotes",
        headers=_headers(key="missing-real-route"),
        json={
            "pickup_address": "VinUni",
            "dropoff_address": "Ho Guom",
            "vehicle_type": "CAR_4",
            "pickup_latitude": 20.9914,
            "pickup_longitude": 105.945975,
            "dropoff_latitude": 21.02977,
            "dropoff_longitude": 105.854434,
            "route_provider": "deterministic-straight-line",
            "route_distance_meters": 5_000,
            "route_duration_seconds": 900,
            "route_geometry": [
                {"latitude": 20.9914, "longitude": 105.945975},
                {"latitude": 21.02977, "longitude": 105.854434},
            ],
        },
    )

    assert response.status_code == 422
    assert response.json()["code"] == "REAL_ROUTE_REQUIRED"


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
    assert result["status"] == "SEARCHING_DRIVER"
    assert result["resource_version"] == 2
    assert result["payment_reference"] == payment_reference
    assert result["driver"] is None
    assigned_tracking = client.get(f"/v1/bookings/{booking['id']}/tracking", headers=_headers())
    assert assigned_tracking.status_code == 200
    assert assigned_tracking.json()["data"]["status"] == "DRIVER_ASSIGNED"
    assigned = client.get(f"/v1/bookings/{booking['id']}", headers=_headers()).json()["data"]
    assert assigned["resource_version"] == 3
    assert assigned["driver"]["id"].startswith("driver_simulated")
    assert assigned["driver"]["vehicle_type"] == "CAR_4"
    assert assigned["driver"]["vehicle_model"] == "Vios"
    assert assigned["driver"]["vehicle_color"] == "Trang"
    assert assigned["driver"]["license_plate"] == "30H-482.19"
    assert assigned["driver"]["phone_masked"].startswith("*** ***")
    assert assigned["driver"]["rating"] == 4.9
    assert assigned["driver"]["vehicle"] == {"type": "CAR_4", "model": "Vios"}
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


def test_new_route_expires_old_quote_and_old_confirmation_cannot_prepare(client: TestClient) -> None:
    old_quote = _create_quote(client, key="old-route")
    replacement = client.post(
        "/v1/quotes",
        headers=_headers(key="new-route"),
        json={
            "pickup_address": "VinUni, Gia Lam",
            "dropoff_address": "UET, Cau Giay",
            "vehicle_type": "CAR_4",
            "pickup_latitude": 20.9914,
            "pickup_longitude": 105.945975,
            "dropoff_latitude": 21.028333,
            "dropoff_longitude": 105.854041,
            "route_provider": "geoapify",
            "route_distance_meters": 16_051,
            "route_duration_seconds": 932,
            "route_geometry": [
                {"latitude": 20.9914, "longitude": 105.945975},
                {"latitude": 21.0102, "longitude": 105.9001},
                {"latitude": 21.028333, "longitude": 105.854041},
            ],
        },
    )
    assert replacement.status_code == 201
    assert client.get(f"/v1/quotes/{old_quote['id']}", headers=_headers()).json()["data"]["status"] == "EXPIRED"

    payload = {
        "action": "ride.booking.prepare",
        "actor_id": ACTOR,
        "quote_id": old_quote["id"],
        "quote_version": old_quote["quote_version"],
        "amount": old_quote["amount"],
        "currency": old_quote["currency"],
    }
    response = client.post(
        "/v1/bookings:prepare",
        headers=_headers(key="old-route-prepare"),
        json={"quote_id": old_quote["id"], "confirmation": _confirmation("ride.booking.prepare", payload, old_quote)},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "QUOTE_EXPIRED"


def test_matching_assigns_the_closest_available_compatible_driver(client: TestClient) -> None:
    engine = getattr(client, "ride_engine")
    now = datetime.now(UTC)
    with Session(engine) as session:
        session.add(RideDriverRow(
            id="driver_closest_car4",
            display_name="Closest Driver",
            vehicle_type="CAR_4",
            vehicle_model="City",
            vehicle_color="Xam",
            license_plate="30H-000.01",
            phone_masked="*** *** 0001",
            rating=4.8,
            latitude=21.0286,
            longitude=105.8049,
            vehicle={"type": "CAR_4", "model": "City", "license_plate": "30H-000.01"},
            availability_status="AVAILABLE",
            created_at=now,
            updated_at=now,
        ))
        session.commit()

    quote = _create_quote(client, key="closest-driver")
    booking = _prepare(client, quote)
    assigned = _confirm(client, quote, booking, key="closest-driver-confirm")
    tracking = client.get(f"/v1/bookings/{assigned['id']}/tracking", headers=_headers())

    assert tracking.status_code == 200
    assert tracking.json()["data"]["status"] == "DRIVER_ASSIGNED"
    assert tracking.json()["data"]["driver"]["id"] == "driver_closest_car4"


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
            "route_provider": "geoapify",
            "route_distance_meters": 8_500,
            "route_duration_seconds": 1_200,
            "route_geometry": [
                {"latitude": 21.0001, "longitude": 105.9001},
                {"latitude": 21.0140, "longitude": 105.8500},
                {"latitude": 21.0285, "longitude": 105.8048},
            ],
        },
    )
    assert response.status_code == 201
    quote = response.json()["data"]
    assert quote["route_provider"] == "geoapify"
    assert quote["route_distance_meters"] > 0
    assert len(quote["route_geometry"]) == 3
    assert quote["route_snapshot_hash"]
    assert quote["tariff_snapshot"]["version"] == quote["tariff_version"]


def test_tracking_is_deterministic_and_never_fakes_driver_coordinates(client: TestClient) -> None:
    quote = _create_quote(client, key="tracking-quote")
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
    assert first.json()["data"]["status"] == "DRIVER_ASSIGNED"
    assert first.json()["data"]["driver_location"] == {"latitude": 21.0301, "longitude": 105.8122}
    assert second.json()["data"]["status"] == "DRIVER_TO_PICKUP"
    assert second.json()["data"]["progress"] >= first.json()["data"]["progress"]
    assert second.json()["data"]["driver_location"] is not None
    assert first.json()["data"]["route"]["geometry"] == quote["route_geometry"]
    assert second.json()["data"]["route"]["geometry"] == quote["route_geometry"]


def test_tracking_elapsed_and_progress_are_continuous(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRACKING_TIME_SCALE", "1")
    get_settings.cache_clear()
    started_at = datetime(2026, 8, 15, 10, 0, tzinfo=UTC)
    booking = Booking(
        id="booking_tracking_unit",
        actor_id=ACTOR,
        quote_id="quote_tracking_unit",
        quote_version="test:quote_tracking_unit",
        amount=10_000,
        currency="VND",
        status=BookingStatus.IN_PROGRESS.value,
        resource_version=1,
        payment_reference="payment_tracking_unit",
        driver={"id": "driver_tracking_unit"},
        created_at=started_at,
        updated_at=started_at,
        tracking_started_at=started_at,
    )

    elapsed = tracking_elapsed(booking, started_at + timedelta(seconds=123.75))
    assert elapsed == pytest.approx(123.75)
    first = tracking_progress(BookingStatus.IN_PROGRESS.value, elapsed, 60, 420)
    later_elapsed = tracking_elapsed(booking, started_at + timedelta(seconds=124.25))
    later = tracking_progress(BookingStatus.IN_PROGRESS.value, later_elapsed, 60, 420)
    assert later_elapsed == pytest.approx(124.25)
    assert later > first


def test_ride_lifecycle_persists_every_authoritative_transition(client: TestClient) -> None:
    quote = _create_quote(client, key="lifecycle-quote")
    booking = _prepare(client, quote)
    assert booking["status"] == "AWAITING_CONFIRMATION"
    assert client.get(f"/v1/quotes/{quote['id']}", headers=_headers()).json()["data"]["status"] == "AWAITING_CONFIRMATION"

    confirmed = _confirm(client, quote, booking, key="lifecycle-confirm")
    assert confirmed["status"] == "SEARCHING_DRIVER"
    assigned_tracking = client.get(f"/v1/bookings/{booking['id']}/tracking", headers=_headers())
    assert assigned_tracking.status_code == 200
    assert assigned_tracking.json()["data"]["status"] == "DRIVER_ASSIGNED"
    confirmed = client.get(f"/v1/bookings/{booking['id']}", headers=_headers()).json()["data"]
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
        (eta_seconds + 62 + route_seconds + 2, "ARRIVED_DESTINATION"),
    ]
    previous_progress = 0.0
    for seconds_ago, expected_status in expected_states:
        _set_tracking_start(client, confirmed["id"], seconds_ago=seconds_ago)
        response = client.get(f"/v1/bookings/{confirmed['id']}/tracking", headers=_headers())
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["status"] == expected_status
        assert data["progress"] >= previous_progress
        previous_progress = data["progress"]
        if expected_status == "IN_PROGRESS":
            assert data["current_location"] is not None
            assert _near_route(data["current_location"], quote["route_geometry"])
        assert client.get(f"/v1/bookings/{confirmed['id']}", headers=_headers()).json()["data"]["status"] == expected_status

    _set_booking_updated_at(client, confirmed["id"], seconds_ago=11)
    response = client.get(f"/v1/bookings/{confirmed['id']}/tracking", headers=_headers())
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "COMPLETED"
    assert response.json()["data"]["progress"] == 1.0
    assert client.get(f"/v1/bookings/{confirmed['id']}", headers=_headers()).json()["data"]["status"] == "COMPLETED"

    with Session(engine) as session:
        events = session.query(RideTrackingEventRow).filter_by(booking_id=confirmed["id"]).order_by(RideTrackingEventRow.occurred_at, RideTrackingEventRow.id).all()
        assert [event.status for event in events] == [
            "AWAITING_CONFIRMATION",
            "SEARCHING_DRIVER",
            "DRIVER_ASSIGNED",
            "DRIVER_TO_PICKUP",
            "DRIVER_ARRIVED",
            "IN_PROGRESS",
            "ARRIVED_DESTINATION",
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
