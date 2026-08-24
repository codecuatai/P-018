from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient
from src.infrastructure.database import get_session
from src.infrastructure.models import BookingRow


def test_update_status_transitions(client: TestClient):
    booking_id = "test_booking_status"
    actor_id = "test_actor_1"

    get_sess = client.app.dependency_overrides.get(get_session, get_session)
    with next(get_sess()) as session:
        session.add(BookingRow(
            id=booking_id,
            actor_id=actor_id,
            quote_id="test_quote_1",
            quote_version="v1",
            passenger_count=1,
            capacity_policy_version="v1",
            amount=100,
            currency="VND",
            status="DRIVER_TO_PICKUP",
            resource_version=1,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ))
        session.commit()

    idempotency_key = str(uuid4())
    headers = {"X-Internal-Service-Token": "test-token", "X-Actor-Id": actor_id, "Idempotency-Key": idempotency_key}

    response = client.patch(
        f"/v1/bookings/{booking_id}:status",
        json={"status": "DRIVER_ARRIVED"},
        headers=headers,
    )
    assert response.status_code == 200

    response = client.patch(
        f"/v1/bookings/{booking_id}:status",
        json={"status": "DRIVER_ARRIVED"},
        headers=headers,
    )
    assert response.status_code == 200

    headers["Idempotency-Key"] = str(uuid4())
    response = client.patch(
        f"/v1/bookings/{booking_id}:status",
        json={"status": "IN_PROGRESS"},
        headers=headers,
    )
    assert response.status_code == 200

    # Check actor ownership
    headers["X-Actor-Id"] = "another_actor"
    response = client.patch(
        f"/v1/bookings/{booking_id}:status",
        json={"status": "COMPLETED"},
        headers=headers,
    )
    assert response.status_code in (403, 404)
