from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from src.config import Settings
from src.models.medical import Appointment, AppointmentStatus, Patient, SlotStatus, TimeSlot
from src.repositories.healthcare_repository import HealthcareRepository

REFUND_REQUIRED_EVENT = "HEALTHCARE_APPOINTMENT_REFUND_REQUIRED"


class HoldSlotError(Exception):
    def __init__(self, status_code: int, code: str, detail: str) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code
        self.detail = detail


class CancelAppointmentError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        detail: str,
        *,
        commit_changes: bool = False,
    ) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code
        self.detail = detail
        self.commit_changes = commit_changes


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _iso_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    aware = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    return aware.astimezone(UTC).isoformat().replace("+00:00", "Z")


def expire_hold(
    repository: HealthcareRepository,
    slot: TimeSlot | None,
    appointment: Appointment | None,
) -> None:
    if slot is not None:
        repository.release_slot(slot)
    if appointment is not None and appointment.status == AppointmentStatus.DRAFT.value:
        repository.expire_draft_appointment(appointment)
        repository.add_audit_log(appointment.id, "BOOKING_EXPIRED", "The slot hold expired.")


def reconcile_expired_holds(repository: HealthcareRepository, now: datetime) -> set[int]:
    expired_appointment_ids: set[int] = set()
    for slot in repository.get_expired_slots_with_lock_for_update(now):
        appointment = repository.get_draft_appointment_for_slot_with_lock_for_update(slot.id)
        expire_hold(repository, slot, appointment)
        repository.mark_reconciliation_changed()
        if appointment is not None:
            expired_appointment_ids.add(appointment.id)
    return expired_appointment_ids


def cancel_appointment(
    repository: HealthcareRepository,
    *,
    actor_id: str,
    appointment_id: int,
    now: datetime | None = None,
) -> dict[str, Any]:
    slot_id = repository.get_actor_appointment_slot_id(appointment_id, actor_id)
    if slot_id is None:
        raise CancelAppointmentError(404, "APPOINTMENT_NOT_FOUND", "Appointment was not found.")

    slot = repository.get_slot_with_lock_for_update(slot_id)
    if slot is None:
        raise CancelAppointmentError(
            409,
            "APPOINTMENT_NOT_CANCELLABLE",
            "The appointment slot is unavailable.",
        )

    appointment = repository.get_actor_appointment_with_lock_for_update(appointment_id, actor_id)
    if appointment is None:
        raise CancelAppointmentError(404, "APPOINTMENT_NOT_FOUND", "Appointment was not found.")
    if appointment.status == AppointmentStatus.EXPIRED.value:
        raise CancelAppointmentError(409, "APPOINTMENT_EXPIRED", "The appointment hold has expired.")
    if appointment.status == AppointmentStatus.CANCELLED.value:
        raise CancelAppointmentError(
            409,
            "APPOINTMENT_ALREADY_CANCELLED",
            "Appointment is already cancelled.",
        )
    if appointment.status == AppointmentStatus.PENDING_REFUND.value:
        raise CancelAppointmentError(
            409,
            "APPOINTMENT_REFUND_PENDING",
            "The appointment cancellation refund is already pending.",
        )
    if appointment.status == AppointmentStatus.REFUNDED.value:
        raise CancelAppointmentError(
            409,
            "APPOINTMENT_ALREADY_REFUNDED",
            "The appointment payment has already been refunded.",
        )
    if appointment.status not in {
        AppointmentStatus.DRAFT.value,
        AppointmentStatus.CONFIRMED.value,
    }:
        raise CancelAppointmentError(
            409,
            "APPOINTMENT_NOT_CANCELLABLE",
            "The appointment cannot be cancelled in its current state.",
        )

    current_time = now or _utc_now()
    if (
        not appointment.is_paid
        and appointment.status == AppointmentStatus.DRAFT.value
        and (
            slot.status != SlotStatus.HOLDING.value
            or slot.hold_expires_at is None
            or slot.hold_expires_at <= current_time
        )
    ):
        expire_hold(repository, slot, appointment)
        raise CancelAppointmentError(
            409,
            "APPOINTMENT_EXPIRED",
            "The appointment hold has expired.",
            commit_changes=True,
        )

    repository.release_slot(slot)
    if appointment.is_paid:
        repository.mark_appointment_pending_refund(appointment)
        repository.add_audit_log(
            appointment.id,
            "BOOKING_CANCELLED_REFUND_PENDING",
            "Booking cancelled; payment refund is required.",
        )
        refund_required = True
        refund_event: str | None = REFUND_REQUIRED_EVENT
        message = "Booking cancelled. Payment refund is pending."
    else:
        repository.cancel_unpaid_appointment(appointment)
        repository.add_audit_log(
            appointment.id,
            "BOOKING_CANCELLED",
            "Booking cancelled without a payment refund.",
        )
        refund_required = False
        refund_event = None
        message = "Booking cancelled."

    return {
        "status": "success",
        "appointment_id": appointment.id,
        "appointment_status": appointment.status,
        "is_paid": appointment.is_paid,
        "slot_id": slot.id,
        "slot_status": slot.status,
        "refund_required": refund_required,
        "refund_event": refund_event,
        "message": message,
    }


class HoldSlotService:
    operation = "healthcare.hold_slot"

    def __init__(
        self,
        repository: HealthcareRepository,
        settings: Settings,
        clock: Callable[[], datetime] = _utc_now,
    ) -> None:
        self.repository = repository
        self.settings = settings
        self.clock = clock

    @staticmethod
    def _request_hash(payload: dict[str, Any]) -> str:
        encoded = json.dumps(
            {"operation": HoldSlotService.operation, "payload": payload},
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    @staticmethod
    def _storage_key(actor_id: str, idempotency_key: str) -> str:
        encoded = json.dumps(
            [actor_id, HoldSlotService.operation, idempotency_key],
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    def _load_idempotent_response(
        self,
        *,
        actor_id: str,
        idempotency_key: str,
        request_hash: str,
    ) -> dict[str, Any] | None:
        record = self.repository.get_idempotency_record(self._storage_key(actor_id, idempotency_key))
        if record is None:
            return None
        if (
            record.actor_id != actor_id
            or record.operation != self.operation
            or record.request_hash != request_hash
        ):
            raise HoldSlotError(
                409,
                "IDEMPOTENCY_KEY_REUSED",
                "The idempotency key was used with a different request.",
            )
        return json.loads(record.response_body)

    def _save_idempotent_response(
        self,
        *,
        actor_id: str,
        idempotency_key: str,
        request_hash: str,
        response: dict[str, Any],
    ) -> None:
        self.repository.save_idempotency_record(
            storage_key=self._storage_key(actor_id, idempotency_key),
            actor_id=actor_id,
            operation=self.operation,
            request_hash=request_hash,
            response_body=json.dumps(response, ensure_ascii=False),
            status_code=200,
        )

    def _resolve_patient(self, actor_id: str, patient_id: int | None) -> Patient:
        if patient_id is not None:
            link = self.repository.get_patient_link(actor_id, patient_id)
            if link is None:
                raise HoldSlotError(403, "PATIENT_NOT_LINKED", "The patient is not linked to this account.")
        else:
            link = self.repository.get_default_patient_link(actor_id)
            if link is None:
                raise HoldSlotError(
                    404,
                    "PATIENT_PROFILE_REQUIRED",
                    "No default patient profile is linked to this account. Create or select a patient profile before booking.",
                )
        if link.patient is None:
            raise HoldSlotError(404, "PATIENT_NOT_FOUND", "Patient was not found.")
        return link.patient

    def _facility_data(self, facility_source_id: str | None) -> dict[str, Any]:
        facility = self.repository.get_active_facility(facility_source_id)
        if facility is None:
            return {
                "name": self.settings.healthcare_facility_name,
                "address": self.settings.healthcare_facility_address,
            }
        return {
            "source_id": facility.source_id,
            "name": facility.name,
            "address": facility.address,
            "facility_type": facility.facility_type,
            "ward": facility.ward,
            "district": facility.district,
            "city": facility.city,
            "latitude": facility.latitude,
            "longitude": facility.longitude,
            "coordinate_status": "validated"
            if facility.latitude is not None and facility.longitude is not None
            else "missing",
            "phone": facility.phone,
            "website": facility.website,
            "source": facility.source_name or "healthcare_catalog",
        }

    def hold_slot(
        self,
        *,
        actor_id: str,
        idempotency_key: str,
        slot_id: int,
        patient_id: int | None,
        symptoms: str,
    ) -> dict[str, Any]:
        payload = {"slot_id": slot_id, "patient_id": patient_id, "symptoms": symptoms}
        request_hash = self._request_hash(payload)
        try:
            cached = self._load_idempotent_response(
                actor_id=actor_id,
                idempotency_key=idempotency_key,
                request_hash=request_hash,
            )
            if cached is not None:
                return cached

            now = self.clock()
            reconcile_expired_holds(self.repository, now)
            patient = self._resolve_patient(actor_id, patient_id)
            slot = self.repository.get_slot_with_lock_for_update(slot_id)
            if slot is None:
                raise HoldSlotError(404, "SLOT_NOT_FOUND", "Time slot was not found.")
            if slot.status != SlotStatus.AVAILABLE.value:
                raise HoldSlotError(409, "SLOT_UNAVAILABLE", "Time slot is not available.")
            if slot.doctor is None or slot.doctor.price is None:
                raise HoldSlotError(
                    422,
                    "DOCTOR_PRICE_UNAVAILABLE",
                    "This doctor does not have an authoritative consultation price yet.",
                )

            hold_expires_at = now + timedelta(minutes=10)
            self.repository.set_slot_holding(slot, hold_expires_at)
            appointment = self.repository.create_draft_appointment(
                actor_id=actor_id,
                patient_id=patient.id,
                symptoms=symptoms,
                doctor_id=slot.doctor_id,
                slot_id=slot.id,
            )
            self.repository.flush()
            response = {
                "appointment_id": appointment.id,
                "patient_id": patient.id,
                "slot_id": slot.id,
                "doctor_id": slot.doctor.id,
                "doctor_name": slot.doctor.name,
                "doctor_description": slot.doctor.description,
                "department": slot.doctor.department.name if slot.doctor.department else None,
                "price": slot.doctor.price,
                "start_time": _iso_utc(slot.start_time),
                "end_time": _iso_utc(slot.end_time),
                "status": AppointmentStatus.DRAFT.value,
                "is_paid": False,
                "hold_expires_at": _iso_utc(hold_expires_at),
                "facility": self._facility_data(slot.doctor.facility_source_id),
            }
            self._save_idempotent_response(
                actor_id=actor_id,
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                response=response,
            )
            self.repository.commit()
            return response
        except HoldSlotError:
            self.repository.rollback()
            raise
        except Exception as error:
            self.repository.rollback()
            raise HoldSlotError(500, "HEALTHCARE_WRITE_FAILED", "Unable to hold the time slot.") from error
