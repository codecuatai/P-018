from __future__ import annotations

from datetime import datetime

from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from src.models.medical import (
    Appointment,
    AppointmentStatus,
    AuditLog,
    HealthcareFacility,
    IdempotencyRecord,
    PatientUserLink,
    SlotStatus,
    TimeSlot,
)


class HealthcareRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_idempotency_record(self, storage_key: str) -> IdempotencyRecord | None:
        return (
            self.session.query(IdempotencyRecord)
            .filter(IdempotencyRecord.idempotency_key == storage_key)
            .first()
        )

    def save_idempotency_record(
        self,
        *,
        storage_key: str,
        actor_id: str,
        operation: str,
        request_hash: str,
        response_body: str,
        status_code: int,
    ) -> None:
        self.session.add(
            IdempotencyRecord(
                idempotency_key=storage_key,
                actor_id=actor_id,
                operation=operation,
                request_hash=request_hash,
                response_body=response_body,
                status_code=status_code,
            )
        )

    def get_patient_link(self, actor_id: str, patient_id: int) -> PatientUserLink | None:
        return (
            self.session.query(PatientUserLink)
            .filter(
                PatientUserLink.actor_user_id == actor_id,
                PatientUserLink.patient_id == patient_id,
            )
            .first()
        )

    def get_default_patient_link(self, actor_id: str) -> PatientUserLink | None:
        return (
            self.session.query(PatientUserLink)
            .filter(
                PatientUserLink.actor_user_id == actor_id,
                PatientUserLink.is_default.is_(True),
            )
            .first()
        )

    def get_slot_with_lock_for_update(self, slot_id: int) -> TimeSlot | None:
        return (
            self.session.query(TimeSlot)
            .filter(TimeSlot.id == slot_id)
            .with_for_update()
            .first()
        )

    def get_expired_slots_with_lock_for_update(self, now: datetime) -> list[TimeSlot]:
        return (
            self.session.query(TimeSlot)
            .filter(
                TimeSlot.status == SlotStatus.HOLDING.value,
                TimeSlot.hold_expires_at.is_not(None),
                TimeSlot.hold_expires_at <= now,
            )
            .with_for_update(skip_locked=True)
            .all()
        )

    def get_draft_appointment_for_slot_with_lock_for_update(self, slot_id: int) -> Appointment | None:
        return (
            self.session.query(Appointment)
            .filter(
                Appointment.slot_id == slot_id,
                Appointment.status == AppointmentStatus.DRAFT.value,
            )
            .with_for_update()
            .first()
        )

    def get_actor_appointment_with_lock_for_update(
        self,
        appointment_id: int,
        actor_id: str,
    ) -> Appointment | None:
        return (
            self.session.query(Appointment)
            .filter(
                Appointment.id == appointment_id,
                Appointment.actor_id == actor_id,
            )
            .with_for_update()
            .first()
        )

    def get_actor_appointment_slot_id(self, appointment_id: int, actor_id: str) -> int | None:
        return (
            self.session.query(Appointment.slot_id)
            .filter(
                Appointment.id == appointment_id,
                Appointment.actor_id == actor_id,
            )
            .scalar()
        )

    @staticmethod
    def set_slot_holding(slot: TimeSlot, expires_at: datetime) -> None:
        slot.status = SlotStatus.HOLDING.value
        slot.hold_expires_at = expires_at

    @staticmethod
    def release_slot(slot: TimeSlot) -> None:
        slot.status = SlotStatus.AVAILABLE.value
        slot.hold_expires_at = None

    @staticmethod
    def expire_draft_appointment(appointment: Appointment) -> None:
        appointment.status = AppointmentStatus.EXPIRED.value

    @staticmethod
    def cancel_unpaid_appointment(appointment: Appointment) -> None:
        appointment.status = AppointmentStatus.CANCELLED.value

    @staticmethod
    def mark_appointment_pending_refund(appointment: Appointment) -> None:
        appointment.status = AppointmentStatus.PENDING_REFUND.value

    def create_draft_appointment(
        self,
        *,
        actor_id: str,
        patient_id: int,
        symptoms: str,
        doctor_id: int,
        slot_id: int,
    ) -> Appointment:
        appointment = Appointment(
            actor_id=actor_id,
            patient_id=patient_id,
            symptoms=symptoms,
            doctor_id=doctor_id,
            slot_id=slot_id,
            status=AppointmentStatus.DRAFT.value,
        )
        self.session.add(appointment)
        return appointment

    def add_audit_log(self, appointment_id: int, action: str, details: str) -> None:
        self.session.add(AuditLog(appointment_id=appointment_id, action=action, details=details))

    def get_active_facility(self, facility_source_id: str | None) -> HealthcareFacility | None:
        query = self.session.query(HealthcareFacility).filter(HealthcareFacility.is_active.is_(True))
        active_version = self.get_active_catalog_version()
        if active_version:
            query = query.filter(HealthcareFacility.dataset_version == active_version)
        if facility_source_id:
            query = query.filter(HealthcareFacility.source_id == facility_source_id)
        return query.order_by(HealthcareFacility.source_id).first()

    def get_active_catalog_version(self) -> str | None:
        try:
            if not inspect(self.session.connection()).has_table("catalog_dataset_versions"):
                return None
            return self.session.execute(
                text(
                    "SELECT dataset_version FROM catalog_dataset_versions "
                    "WHERE domain='healthcare' AND is_active=TRUE "
                    "ORDER BY imported_at DESC, dataset_version DESC LIMIT 1"
                )
            ).scalar_one_or_none()
        except SQLAlchemyError:
            return None

    def mark_reconciliation_changed(self) -> None:
        self.session.info["healthcare_reconciliation_changed"] = True

    def flush(self) -> None:
        self.session.flush()

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()
