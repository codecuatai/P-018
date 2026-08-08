from __future__ import annotations

import hashlib
import json
import unicodedata
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.api.dependencies import verify_internal_service_token
from src.database import get_db
from src.models.medical import (
    Appointment,
    AppointmentStatus,
    AuditLog,
    Department,
    Doctor,
    IdempotencyRecord,
    Patient,
    SlotStatus,
    TimeSlot,
)

router = APIRouter(prefix="/api/v1", tags=["healthcare"])


class HoldSlotRequest(BaseModel):
    slot_id: int = Field(ge=1)
    patient_id: int | None = Field(default=None, ge=1)
    symptoms: str = Field(min_length=1, max_length=2000)


class WebhookRequest(BaseModel):
    appointment_id: int = Field(ge=1)


def _require_actor(x_actor_id: str | None) -> str:
    if not x_actor_id:
        raise HTTPException(status_code=401, detail={"code": "ACTOR_REQUIRED", "detail": "Actor identity is required."})
    return x_actor_id


def _request_hash(operation: str, payload: dict[str, Any]) -> str:
    encoded = json.dumps({"operation": operation, "payload": payload}, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _load_idempotency(
    db: Session,
    key: str | None,
    actor_id: str,
    operation: str,
    request_hash: str,
) -> dict[str, Any] | None:
    if not key:
        return None
    record = db.query(IdempotencyRecord).filter(IdempotencyRecord.idempotency_key == key).first()
    if not record:
        return None
    if record.actor_id != actor_id or record.operation != operation or record.request_hash != request_hash:
        raise HTTPException(
            status_code=409,
            detail={"code": "IDEMPOTENCY_KEY_REUSED", "detail": "The idempotency key was used with a different request."},
        )
    return json.loads(record.response_body)


def _save_idempotency(
    db: Session,
    key: str | None,
    actor_id: str,
    operation: str,
    request_hash: str,
    response: dict[str, Any],
) -> None:
    if key:
        db.add(
            IdempotencyRecord(
                idempotency_key=key,
                actor_id=actor_id,
                operation=operation,
                request_hash=request_hash,
                response_body=json.dumps(response, ensure_ascii=False),
                status_code=200,
            )
        )


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _fold_department_name(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value.casefold())
    folded = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return folded.replace("đ", "d")


def _release_expired_slots(db: Session) -> None:
    expired_slots = (
        db.query(TimeSlot)
        .filter(TimeSlot.status == SlotStatus.HOLDING, TimeSlot.hold_expires_at < _now())
        .all()
    )
    for slot in expired_slots:
        slot.status = SlotStatus.AVAILABLE.value
        slot.hold_expires_at = None
        appointment = (
            db.query(Appointment)
            .filter(Appointment.slot_id == slot.id, Appointment.status == AppointmentStatus.DRAFT)
            .first()
        )
        if appointment:
            appointment.status = AppointmentStatus.EXPIRED.value
            db.add(AuditLog(appointment_id=appointment.id, action="BOOKING_EXPIRED", details="The slot hold expired."))
    if expired_slots:
        db.commit()


def _resolve_patient(db: Session, patient_id: int | None) -> Patient:
    patient = (
        db.query(Patient).filter(Patient.id == patient_id).first()
        if patient_id is not None
        else db.query(Patient).order_by(Patient.id).first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail={"code": "PATIENT_NOT_FOUND", "detail": "Patient was not found."})
    return patient


def _appointment_data(appointment: Appointment) -> dict[str, Any]:
    slot = appointment.slot
    doctor = appointment.doctor
    department = doctor.department if doctor else None
    return {
        "appointment_id": appointment.id,
        "actor_id": appointment.actor_id,
        "patient_id": appointment.patient_id,
        "symptoms": appointment.symptoms,
        "status": appointment.status,
        "is_paid": appointment.is_paid,
        "price": doctor.price if doctor else None,
        "doctor": {
            "id": doctor.id,
            "name": doctor.name,
            "description": doctor.description,
            "price": doctor.price,
        } if doctor else None,
        "department": {
            "id": department.id,
            "name": department.name,
            "description": department.description,
        } if department else None,
        "slot": {
            "id": slot.id,
            "start_time": slot.start_time.isoformat(),
            "end_time": slot.end_time.isoformat(),
            "status": slot.status,
            "hold_expires_at": slot.hold_expires_at.isoformat() if slot.hold_expires_at else None,
        } if slot else None,
    }


@router.get("/departments")
def get_departments(
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
) -> dict[str, Any]:
    departments = db.query(Department).order_by(Department.name).all()
    return {"data": [{"id": department.id, "name": department.name, "description": department.description} for department in departments]}


@router.get("/doctors")
def get_doctors_by_department(
    department: str,
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
) -> dict[str, Any]:
    _release_expired_slots(db)
    folded_department = _fold_department_name(department)
    department_record = next(
        (
            candidate
            for candidate in db.query(Department).all()
            if folded_department in _fold_department_name(candidate.name)
        ),
        None,
    )
    if not department_record:
        raise HTTPException(status_code=404, detail={"code": "DEPARTMENT_NOT_FOUND", "detail": "Department was not found."})

    doctors: list[dict[str, Any]] = []
    for doctor in db.query(Doctor).filter(Doctor.department_id == department_record.id).order_by(Doctor.name).all():
        slots = (
            db.query(TimeSlot)
            .filter(TimeSlot.doctor_id == doctor.id, TimeSlot.status == SlotStatus.AVAILABLE)
            .order_by(TimeSlot.start_time)
            .all()
        )
        doctors.append(
            {
                "id": doctor.id,
                "name": doctor.name,
                "price": doctor.price,
                "description": doctor.description,
                "department": {
                    "id": department_record.id,
                    "name": department_record.name,
                    "description": department_record.description,
                },
                "available_slots": [
                    {
                        "id": slot.id,
                        "start_time": slot.start_time.isoformat(),
                        "end_time": slot.end_time.isoformat(),
                    }
                    for slot in slots
                ],
            }
        )
    return {"data": doctors}


@router.post("/slots/hold")
def hold_slot(
    request: HoldSlotRequest,
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
    x_actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict[str, Any]:
    actor_id = _require_actor(x_actor_id)
    operation = "healthcare.hold_slot"
    payload = request.model_dump()
    request_hash = _request_hash(operation, payload)
    cached = _load_idempotency(db, idempotency_key, actor_id, operation, request_hash)
    if cached is not None:
        return {"data": cached}

    try:
        _release_expired_slots(db)
        patient = _resolve_patient(db, request.patient_id)
        slot = db.query(TimeSlot).filter(TimeSlot.id == request.slot_id).with_for_update().first()
        if not slot:
            raise HTTPException(status_code=404, detail={"code": "SLOT_NOT_FOUND", "detail": "Time slot was not found."})
        if slot.status != SlotStatus.AVAILABLE:
            raise HTTPException(status_code=409, detail={"code": "SLOT_UNAVAILABLE", "detail": "Time slot is not available."})

        slot.status = SlotStatus.HOLDING.value
        slot.hold_expires_at = _now() + timedelta(minutes=10)
        appointment = Appointment(
            actor_id=actor_id,
            patient_id=patient.id,
            symptoms=request.symptoms,
            doctor_id=slot.doctor_id,
            slot_id=slot.id,
            status=AppointmentStatus.DRAFT.value,
        )
        db.add(appointment)
        db.flush()
        response = {
            "appointment_id": appointment.id,
            "patient_id": patient.id,
            "slot_id": slot.id,
            "doctor_id": slot.doctor.id,
            "doctor_name": slot.doctor.name,
            "doctor_description": slot.doctor.description,
            "department": slot.doctor.department.name if slot.doctor.department else None,
            "price": slot.doctor.price,
            "start_time": slot.start_time.isoformat(),
            "end_time": slot.end_time.isoformat(),
            "status": AppointmentStatus.DRAFT.value,
            "is_paid": False,
            "hold_expires_at": slot.hold_expires_at.isoformat() if slot.hold_expires_at else None,
        }
        _save_idempotency(db, idempotency_key, actor_id, operation, request_hash, response)
        db.commit()
        return {"data": response}
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail={"code": "HEALTHCARE_WRITE_FAILED", "detail": "Unable to hold the time slot."}) from None


@router.get("/appointments/{appointment_id}")
def get_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
    x_actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
) -> dict[str, Any]:
    actor_id = _require_actor(x_actor_id)
    _release_expired_slots(db)
    appointment = (
        db.query(Appointment)
        .filter(Appointment.id == appointment_id, Appointment.actor_id == actor_id)
        .first()
    )
    if not appointment:
        raise HTTPException(status_code=404, detail={"code": "APPOINTMENT_NOT_FOUND", "detail": "Appointment was not found."})
    return {"data": _appointment_data(appointment)}


@router.post("/appointments/{appointment_id}/confirm")
def confirm_booking(
    appointment_id: int,
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
    x_actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict[str, Any]:
    actor_id = _require_actor(x_actor_id)
    operation = "healthcare.confirm_appointment"
    payload = {"appointment_id": appointment_id}
    request_hash = _request_hash(operation, payload)
    cached = _load_idempotency(db, idempotency_key, actor_id, operation, request_hash)
    if cached is not None:
        return {"data": cached}

    try:
        appointment = (
            db.query(Appointment)
            .filter(Appointment.id == appointment_id, Appointment.actor_id == actor_id)
            .first()
        )
        if not appointment:
            raise HTTPException(status_code=404, detail={"code": "APPOINTMENT_NOT_FOUND", "detail": "Appointment was not found."})
        if appointment.status == AppointmentStatus.CONFIRMED:
            raise HTTPException(status_code=409, detail={"code": "APPOINTMENT_ALREADY_CONFIRMED", "detail": "Appointment is already confirmed."})
        if appointment.status != AppointmentStatus.DRAFT:
            raise HTTPException(status_code=409, detail={"code": "APPOINTMENT_NOT_CONFIRMABLE", "detail": "Only an active appointment hold can be confirmed."})
        if not appointment.is_paid:
            raise HTTPException(status_code=409, detail={"code": "PAYMENT_REQUIRED", "detail": "Appointment payment is required before confirmation."})

        slot = appointment.slot
        appointment.status = AppointmentStatus.CONFIRMED.value
        if slot:
            slot.status = SlotStatus.BOOKED.value
            slot.hold_expires_at = None
        db.add(AuditLog(appointment_id=appointment.id, action="BOOKING_CONFIRMED", details="Booking confirmed."))
        response = {"status": "success", "appointment_id": appointment.id, "message": "Booking confirmed.", "appointment": _appointment_data(appointment)}
        _save_idempotency(db, idempotency_key, actor_id, operation, request_hash, response)
        db.commit()
        return {"data": response}
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail={"code": "HEALTHCARE_WRITE_FAILED", "detail": "Unable to confirm the appointment."}) from None


@router.post("/appointments/{appointment_id}/cancel")
def cancel_booking(
    appointment_id: int,
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
    x_actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict[str, Any]:
    actor_id = _require_actor(x_actor_id)
    operation = "healthcare.cancel_appointment"
    payload = {"appointment_id": appointment_id}
    request_hash = _request_hash(operation, payload)
    cached = _load_idempotency(db, idempotency_key, actor_id, operation, request_hash)
    if cached is not None:
        return {"data": cached}

    try:
        appointment = (
            db.query(Appointment)
            .filter(Appointment.id == appointment_id, Appointment.actor_id == actor_id)
            .first()
        )
        if not appointment:
            raise HTTPException(status_code=404, detail={"code": "APPOINTMENT_NOT_FOUND", "detail": "Appointment was not found."})
        if appointment.status == AppointmentStatus.CANCELLED:
            raise HTTPException(status_code=409, detail={"code": "APPOINTMENT_ALREADY_CANCELLED", "detail": "Appointment is already cancelled."})
        if appointment.status == AppointmentStatus.EXPIRED:
            raise HTTPException(status_code=409, detail={"code": "APPOINTMENT_EXPIRED", "detail": "The appointment hold has expired."})

        slot = appointment.slot
        appointment.status = AppointmentStatus.CANCELLED.value
        if slot:
            slot.status = SlotStatus.AVAILABLE.value
            slot.hold_expires_at = None
        db.add(AuditLog(appointment_id=appointment.id, action="BOOKING_CANCELLED", details="Booking cancelled."))
        response = {
            "status": "success",
            "appointment_id": appointment.id,
            "slot_id": slot.id if slot else None,
            "slot_status": slot.status if slot else None,
            "message": "Booking cancelled.",
        }
        _save_idempotency(db, idempotency_key, actor_id, operation, request_hash, response)
        db.commit()
        return {"data": response}
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail={"code": "HEALTHCARE_WRITE_FAILED", "detail": "Unable to cancel the appointment."}) from None


@router.post("/payment/webhook")
def payment_webhook(
    request: WebhookRequest,
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
    x_actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict[str, Any]:
    actor_id = _require_actor(x_actor_id)
    operation = "healthcare.payment.acknowledge"
    payload = request.model_dump()
    request_hash = _request_hash(operation, payload)
    cached = _load_idempotency(db, idempotency_key, actor_id, operation, request_hash)
    if cached is not None:
        return {"data": cached}
    try:
        appointment = (
            db.query(Appointment)
            .filter(Appointment.id == request.appointment_id, Appointment.actor_id == actor_id)
            .first()
        )
        if not appointment:
            raise HTTPException(status_code=404, detail={"code": "APPOINTMENT_NOT_FOUND", "detail": "Appointment was not found."})
        appointment.is_paid = True
        response = {
            "status": "success",
            "appointment_id": appointment.id,
            "is_paid": True,
            "message": "Appointment marked as paid.",
        }
        _save_idempotency(db, idempotency_key, actor_id, operation, request_hash, response)
        db.commit()
        return {"data": response}
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail={"code": "HEALTHCARE_PAYMENT_FAILED", "detail": "Unable to acknowledge the appointment payment."}) from None
