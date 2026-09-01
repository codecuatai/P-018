from seeds.seed_demo_patient import DEMO_PATIENT_NAME, DEMO_PATIENT_PHONE, ensure_demo_patient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from src.models.medical import Base, Patient, PatientUserLink


def test_demo_patient_seed_is_additive_and_idempotent() -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as db:
            first = ensure_demo_patient(db, "usr_demo_001", 1)
            db.commit()
            second = ensure_demo_patient(db, "usr_demo_001", 1)
            db.commit()

            assert first.id == second.id == 1
            assert db.query(Patient).count() == 1
            assert db.query(PatientUserLink).count() == 1
            assert first.name == DEMO_PATIENT_NAME
            assert first.phone == DEMO_PATIENT_PHONE
            assert db.query(PatientUserLink).one().is_default is True
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
