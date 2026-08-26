from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from src.database import Base, get_db
from src.main import app
from src.models.medical import (
    Appointment,
    Department,
    Doctor,
    HealthcareFacility,
    Patient,
    PatientUserLink,
    SlotStatus,
    TimeSlot,
)

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
        db.add_all([
            PatientUserLink(actor_user_id=actor, patient_id=patient.id, relationship_type="self", is_default=index == 0)
            for index, actor in enumerate(("actor-health-test", "actor-replacement", "actor-other"))
        ])
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


def test_departments_are_ordered_before_pagination() -> None:
    with TestingSessionLocal() as db:
        db.add_all(
            [
                Department(name="Khoa Tim mạch", description="Cardiology"),
                Department(name="Khoa Da liễu", description="Dermatology"),
                Department(name="Khoa Nhi", description="Pediatrics"),
            ]
        )
        db.commit()

    first_page = client.get("/api/v1/departments?limit=2&offset=0", headers=headers())
    assert first_page.status_code == 200, first_page.text
    assert [item["name"] for item in first_page.json()["data"]["items"]] == ["Khoa Da liễu", "Khoa Nhi"]
    assert first_page.json()["data"]["total"] == 4

    second_page = client.get("/api/v1/departments?limit=2&offset=2", headers=headers())
    assert second_page.status_code == 200, second_page.text
    assert [item["name"] for item in second_page.json()["data"]["items"]] == ["Khoa Nội Thần kinh", "Khoa Tim mạch"]


@pytest.mark.parametrize(
    ("limit", "offset", "expected_count"),
    [(1, 0, 1), (1, 1, 1), (10, 0, 4), (10, 20, 0)],
)
def test_departments_pagination_parameters(limit: int, offset: int, expected_count: int) -> None:
    with TestingSessionLocal() as db:
        db.add_all(
            [
                Department(name="Khoa Tim mạch", description="Cardiology"),
                Department(name="Khoa Da liễu", description="Dermatology"),
                Department(name="Khoa Nhi", description="Pediatrics"),
            ]
        )
        db.commit()

    response = client.get(f"/api/v1/departments?limit={limit}&offset={offset}", headers=headers())
    assert response.status_code == 200, response.text
    assert len(response.json()["data"]["items"]) == expected_count


def test_departments_keyword_filter_uses_department_columns() -> None:
    response = client.get("/api/v1/departments?keyword=Neurology&limit=100&offset=0", headers=headers())
    assert response.status_code == 200, response.text
    assert [item["name"] for item in response.json()["data"]["items"]] == ["Khoa Nội Thần kinh"]


def test_departments_recover_when_optional_catalog_version_probe_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.api import routes as healthcare_routes

    class MissingRegistryInspector:
        @staticmethod
        def has_table(_table_name: str) -> bool:
            return True

    monkeypatch.setattr(healthcare_routes, "inspect", lambda _connection: MissingRegistryInspector())
    response = client.get("/api/v1/departments?limit=100&offset=0", headers=headers())
    assert response.status_code == 200, response.text
    assert response.json()["data"]["total"] == 1


def test_departments_include_facility_data_without_changing_pagination() -> None:
    with TestingSessionLocal() as db:
        db.add(
            HealthcareFacility(
                source_id="facility-departments",
                name="Phòng khám X-One",
                address="12 Nguyễn Trãi",
                is_active=True,
            )
        )
        db.flush()
        department = db.query(Department).filter(Department.id == 1).one()
        department.facility_source_id = "facility-departments"
        db.commit()

    response = client.get("/api/v1/departments?limit=100&offset=0", headers=headers())
    assert response.status_code == 200, response.text
    first = next(item for item in response.json()["data"]["items"] if item["id"] == 1)
    assert first["facility"]["source_id"] == "facility-departments"


def test_doctors_exclude_past_available_slots() -> None:
    with TestingSessionLocal() as db:
        doctor = db.query(Doctor).filter(Doctor.id == 1).one()
        now = datetime.now(UTC).replace(tzinfo=None)
        db.add(
            TimeSlot(
                doctor_id=doctor.id,
                start_time=now - timedelta(days=1),
                end_time=now - timedelta(days=1) + timedelta(minutes=30),
                status=SlotStatus.AVAILABLE.value,
            )
        )
        db.commit()

    response = client.get("/api/v1/doctors?department=Khoa%20N%E1%BB%99i%20Th%E1%BA%A7n%20kinh", headers=headers())
    assert response.status_code == 200, response.text
    returned_slots = response.json()["data"][0]["available_slots"]
    assert len(returned_slots) == 2
    assert all(datetime.fromisoformat(slot["start_time"].replace("Z", "+00:00")) > datetime.now(UTC) for slot in returned_slots)


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


def test_doctor_without_source_price_is_browseable_but_not_holdable() -> None:
    with TestingSessionLocal() as db:
        doctor = Doctor(name="BS. Chưa có giá", price=None, description="Needs price", department_id=1)
        db.add(doctor)
        db.flush()
        slot = TimeSlot(
            doctor_id=doctor.id,
            start_time=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=2),
            end_time=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=2, minutes=30),
            status=SlotStatus.AVAILABLE.value,
        )
        db.add(slot)
        db.commit()
        slot_id = slot.id

    response = client.post(
        "/api/v1/slots/hold",
        headers=headers(key="missing-price-hold"),
        json={"slot_id": slot_id, "patient_id": 1, "symptoms": "test"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "DOCTOR_PRICE_UNAVAILABLE"


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
    assert appointment["hold_expires_at"].endswith("Z")
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


def test_facility_lookup_returns_only_active_healthcare_catalog_data() -> None:
    with TestingSessionLocal() as db:
        db.add(
            HealthcareFacility(
                source_id="facility-test-001",
                name="Bệnh viện X-One",
                address="1 Đường Mẫu, Hà Nội",
                city="Hà Nội",
                latitude=21.03,
                longitude=105.81,
                source_name="test-catalog",
            )
        )
        db.commit()

    response = client.get("/api/v1/facilities/facility-test-001", headers=headers())
    assert response.status_code == 200
    assert response.json()["data"] == {
        "source_id": "facility-test-001",
        "name": "Bệnh viện X-One",
        "address": "1 Đường Mẫu, Hà Nội",
        "facility_type": None,
        "ward": None,
        "district": None,
        "city": "Hà Nội",
        "latitude": 21.03,
        "longitude": 105.81,
        "coordinate_status": "validated",
        "phone": None,
        "website": None,
        "source": "test-catalog",
    }

    slash_source_id = "osm/way-218625367"
    with TestingSessionLocal() as db:
        db.add(
            HealthcareFacility(
                source_id=slash_source_id,
                name="Phòng khám có source ID dạng path",
                address="2 Đường Mẫu, Hà Nội",
                city="Hà Nội",
                latitude=21.031,
                longitude=105.811,
                source_name="test-catalog",
            )
        )
        db.commit()

    slash_response = client.get(f"/api/v1/facilities/{slash_source_id}", headers=headers())
    assert slash_response.status_code == 200
    assert slash_response.json()["data"]["source_id"] == slash_source_id

    missing = client.get("/api/v1/facilities/not-found", headers=headers())
    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "FACILITY_NOT_FOUND"


def test_patient_links_are_actor_scoped_and_support_default_dependents() -> None:
    linked = client.get("/api/v1/patients", headers=headers())
    assert linked.status_code == 200
    assert linked.json()["data"]["items"][0]["relationship"] == "self"
    dependent = client.post(
        "/api/v1/patients",
        headers=headers(key="patient-dependent"),
        json={"name": "Người phụ thuộc", "phone": "0911111111", "relationship": "dependent"},
    )
    assert dependent.status_code == 200
    dependent_id = dependent.json()["data"]["id"]
    selected = client.post(f"/api/v1/patients/{dependent_id}/default", headers=headers(key="patient-default"))
    assert selected.status_code == 200
    assert selected.json()["data"]["is_default"] is True

    other_actor = client.get("/api/v1/patients", headers=headers(actor="actor-unlinked"))
    assert other_actor.status_code == 200
    assert other_actor.json()["data"]["items"] == []
    denied = client.post(
        "/api/v1/slots/hold",
        headers=headers(actor="actor-unlinked", key="unlinked-patient-hold"),
        json={"slot_id": 1, "patient_id": 1, "symptoms": "test"},
    )
    assert denied.status_code == 403
    assert denied.json()["detail"]["code"] == "PATIENT_NOT_LINKED"
