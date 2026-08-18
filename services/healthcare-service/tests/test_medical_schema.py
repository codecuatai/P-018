from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, configure_mappers
from src.database import Base
from src.models.medical import Appointment, AppointmentStatus, Department, Doctor, Patient, SlotStatus, TimeSlot


def test_orm_relationships_and_active_slot_index_are_configured() -> None:
    configure_mappers()

    assert Appointment.slot.property.back_populates == "appointments"
    assert TimeSlot.appointments.property.back_populates == "slot"
    index = next(index for index in Appointment.__table__.indexes if index.name == "uq_appointments_active_slot")
    assert index.unique is True
    assert "DRAFT" in str(index.dialect_options["postgresql"]["where"])
    assert any(constraint.name == "appointments_status_check" for constraint in Appointment.__table__.constraints)


def test_cancelled_appointment_can_reuse_slot_but_active_duplicate_is_rejected() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        department = Department(name="Khoa kiểm tra schema", description="Test")
        doctor = Doctor(name="Bác sĩ schema", price=100_000, department=department, description="Test")
        patient = Patient(name="Bệnh nhân schema", phone="0000000000")
        slot = TimeSlot(
            doctor=doctor,
            start_time=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1),
            end_time=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1, minutes=30),
            status=SlotStatus.HOLDING.value,
        )
        first = Appointment(
            actor_id="actor-schema-a",
            patient=patient,
            doctor=doctor,
            slot=slot,
            status=AppointmentStatus.DRAFT.value,
        )
        db.add(first)
        db.commit()

        duplicate = Appointment(
            actor_id="actor-schema-b",
            patient=patient,
            doctor=doctor,
            slot=slot,
            status=AppointmentStatus.DRAFT.value,
        )
        db.add(duplicate)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        first = db.get(Appointment, first.id)
        assert first is not None
        first.status = AppointmentStatus.CANCELLED.value
        slot = db.get(TimeSlot, slot.id)
        assert slot is not None
        slot.status = SlotStatus.AVAILABLE.value
        db.commit()

        replacement = Appointment(
            actor_id="actor-schema-b",
            patient=patient,
            doctor=doctor,
            slot=slot,
            status=AppointmentStatus.DRAFT.value,
        )
        db.add(replacement)
        db.commit()
        assert replacement.id != first.id
