"""Additively provision the configured development demo patient's self-link."""

from __future__ import annotations

import os

from sqlalchemy import text
from sqlalchemy.orm import Session

from src.database import SessionLocal
from src.models.medical import Patient, PatientUserLink

DEMO_PATIENT_NAME = "Người dùng demo X-One"
DEMO_PATIENT_PHONE = "0900000000"


def ensure_demo_patient(db: Session, actor_user_id: str, patient_id: int) -> Patient:
    """Return the configured demo patient without replacing existing user data."""
    existing_link = db.query(PatientUserLink).filter(PatientUserLink.actor_user_id == actor_user_id).first()
    if existing_link is not None:
        if existing_link.patient_id != patient_id:
            raise RuntimeError(
                "Configured HEALTHCARE_DEFAULT_PATIENT_ID does not match the existing demo patient link."
            )
        patient = db.get(Patient, patient_id)
        if patient is None:
            raise RuntimeError("The existing demo patient link points to a missing patient.")
        return patient

    patient = db.get(Patient, patient_id)
    if patient is None:
        patient = Patient(
            id=patient_id,
            name=DEMO_PATIENT_NAME,
            phone=DEMO_PATIENT_PHONE,
            blood_type=None,
            medical_history="Hồ sơ dùng cho môi trường phát triển",
        )
        db.add(patient)
        db.flush()
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            db.execute(
                text(
                    "SELECT setval(pg_get_serial_sequence('patients', 'id'), "
                    "(SELECT COALESCE(MAX(id), 1) FROM patients), true)"
                )
            )
    elif patient.name != DEMO_PATIENT_NAME or patient.phone != DEMO_PATIENT_PHONE:
        raise RuntimeError(
            "Configured HEALTHCARE_DEFAULT_PATIENT_ID belongs to a non-demo patient; refusing to link it."
        )

    db.add(
        PatientUserLink(
            actor_user_id=actor_user_id,
            patient_id=patient.id,
            relationship_type="self",
            is_default=True,
        )
    )
    return patient


def _required_positive_integer(name: str) -> int:
    raw_value = os.environ.get(name, "").strip()
    try:
        value = int(raw_value)
    except ValueError as error:
        raise RuntimeError(f"{name} must be a positive integer for the development demo seed.") from error
    if value < 1:
        raise RuntimeError(f"{name} must be a positive integer for the development demo seed.")
    return value


def seed_data() -> None:
    if os.environ.get("DEMO_AUTH_ENABLED", "false").strip().lower() != "true":
        print("Demo authentication is disabled; Healthcare demo patient seed skipped.")
        return

    actor_user_id = os.environ.get("DEMO_AUTH_USER_ID", "").strip()
    if not actor_user_id:
        raise RuntimeError("DEMO_AUTH_USER_ID is required when demo authentication is enabled.")

    patient_id = _required_positive_integer("HEALTHCARE_DEFAULT_PATIENT_ID")
    with SessionLocal() as db:
        patient = ensure_demo_patient(db, actor_user_id, patient_id)
        seeded_patient_id = patient.id
        db.commit()
    print(f"Healthcare development demo patient {seeded_patient_id} is linked to {actor_user_id}.")


if __name__ == "__main__":
    seed_data()
