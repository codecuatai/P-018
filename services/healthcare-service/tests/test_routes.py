from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from src.database import Base, get_db
from src.main import app
from src.models.medical import Appointment, Department, Doctor, Patient, SlotStatus, TimeSlot

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_database() -> None:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestingSessionLocal() as db:
        department = Department(name="Khoa Nội Thần kinh", description="Neurology")
        doctor = Doctor(name="BS. Test", price=500_000, description="Test doctor", department=department)
        patient = Patient(name="Bệnh nhân test", phone="0900000000")
        db.add_all([department, doctor, patient])
        db.flush()
        base = datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1)
        db.add_all(
            [
                TimeSlot(doctor=doctor, start_time=base, end_time=base + timedelta(minutes=30), status=SlotStatus.AVAILABLE.value),
                TimeSlot(doctor=doctor, start_time=base + timedelta(hours=1), end_time=base + timedelta(hours=1, minutes=30), status=SlotStatus.AVAILABLE.value),
            ]
        )
        db.commit()


def headers(actor: str = "actor-health-test", key: str | None = None) -> dict[str, str]:
    result = {"X-Internal-Service-Token": "test-token", "X-Actor-Id": actor}
    if key is not None:
        result["Idempotency-Key"] = key
    return result


def hold(client: TestClient, *, actor: str = "actor-health-test", slot_id: int = 1, key: str = "hold-1") -> dict:
    response = client.post(
        "/api/v1/slots/hold",
        headers=headers(actor, key),
        json={"slot_id": slot_id, "patient_id": 1, "symptoms": "đau đầu"},
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def expire_appointment(appointment_id: int) -> None:
    with TestingSessionLocal() as db:
        appointment = db.get(Appointment, appointment_id)
        assert appointment is not None
        appointment.slot.hold_expires_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
        db.commit()


@pytest.mark.parametrize(
    ("path", "method"),
    [
        ("/api/v1/slots/hold", "post"),
        ("/api/v1/appointments/1/confirm", "post"),
        ("/api/v1/appointments/1/cancel", "post"),
        ("/api/v1/payment/webhook", "post"),
    ],
)
def test_healthcare_writes_require_idempotency_key(path: str, method: str) -> None:
    payload = {"slot_id": 1, "patient_id": 1, "symptoms": "test"} if path.endswith("/hold") else {"appointment_id": 1}
    response = getattr(client, method)(path, headers=headers(), json=payload)
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "IDEMPOTENCY_KEY_REQUIRED"


@pytest.mark.parametrize("key", ["", "   "])
def test_healthcare_writes_reject_empty_idempotency_key(key: str) -> None:
    response = client.post(
        "/api/v1/slots/hold",
        headers=headers(key=key),
        json={"slot_id": 1, "patient_id": 1, "symptoms": "test"},
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "IDEMPOTENCY_KEY_REQUIRED"


def test_healthcare_writes_reject_oversized_idempotency_key() -> None:
    response = client.post(
        "/api/v1/slots/hold",
        headers=headers(key="k" * 256),
        json={"slot_id": 1, "patient_id": 1, "symptoms": "test"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "IDEMPOTENCY_KEY_INVALID"


def test_expired_hold_rejects_payment_and_final_confirmation_and_releases_slot() -> None:
    appointment = hold(client)
    expire_appointment(appointment["appointment_id"])

    payment = client.post(
        "/api/v1/payment/webhook",
        headers=headers(key="payment-expired"),
        json={"appointment_id": appointment["appointment_id"]},
    )
    assert payment.status_code == 409
    assert payment.json()["detail"]["code"] == "APPOINTMENT_EXPIRED"

    current = client.get(
        f"/api/v1/appointments/{appointment['appointment_id']}",
        headers=headers(),
    )
    assert current.status_code == 200
    assert current.json()["data"]["status"] == "EXPIRED"
    assert current.json()["data"]["is_paid"] is False
    assert current.json()["data"]["slot"]["status"] == "AVAILABLE"
    assert current.json()["data"]["slot"]["hold_expires_at"] is None

    confirmation = client.post(
        f"/api/v1/appointments/{appointment['appointment_id']}/confirm",
        headers=headers(key="confirm-expired"),
    )
    assert confirmation.status_code == 409
    assert confirmation.json()["detail"]["code"] == "APPOINTMENT_EXPIRED"

    replacement = hold(client, actor="actor-replacement", key="replacement-hold")
    assert replacement["slot_id"] == appointment["slot_id"]


def test_active_payment_confirmation_cancellation_and_scoped_replay() -> None:
    appointment = hold(client, key="same-client-key")
    replay = hold(client, key="same-client-key")
    assert replay["appointment_id"] == appointment["appointment_id"]

    changed = client.post(
        "/api/v1/slots/hold",
        headers=headers(key="same-client-key"),
        json={"slot_id": 2, "patient_id": 1, "symptoms": "khác nội dung"},
    )
    assert changed.status_code == 409
    assert changed.json()["detail"]["code"] == "IDEMPOTENCY_KEY_REUSED"

    other_actor = hold(client, actor="actor-other", slot_id=2, key="same-client-key")
    assert other_actor["appointment_id"] != appointment["appointment_id"]

    payment = client.post(
        "/api/v1/payment/webhook",
        headers=headers(key="payment-active"),
        json={"appointment_id": appointment["appointment_id"]},
    )
    assert payment.status_code == 200
    assert payment.json()["data"]["is_paid"] is True
    assert client.post(
        "/api/v1/payment/webhook",
        headers=headers(key="payment-active"),
        json={"appointment_id": appointment["appointment_id"]},
    ).json()["data"] == payment.json()["data"]

    confirmed = client.post(
        f"/api/v1/appointments/{appointment['appointment_id']}/confirm",
        headers=headers(key="confirm-active"),
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["data"]["appointment"]["status"] == "CONFIRMED"

    cancelled = client.post(
        f"/api/v1/appointments/{appointment['appointment_id']}/cancel",
        headers=headers(key="cancel-active"),
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["data"]["slot_status"] == "AVAILABLE"


def test_confirm_cannot_bypass_payment() -> None:
    appointment = hold(client, key="unpaid-hold")
    response = client.post(
        f"/api/v1/appointments/{appointment['appointment_id']}/confirm",
        headers=headers(key="unpaid-confirm"),
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "PAYMENT_REQUIRED"


def test_healthcare_owns_facility_identity_in_hold_and_appointment_responses() -> None:
    appointment = hold(client, key="facility-hold")
    assert appointment["facility"] == {
        "name": "X-One Healthcare Clinic",
        "address": "12 Nguyen Trai, Thanh Xuan, Ha Noi",
    }
    current = client.get(f"/api/v1/appointments/{appointment['appointment_id']}", headers=headers())
    assert current.status_code == 200
    assert current.json()["data"]["facility"] == appointment["facility"]
