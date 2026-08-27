from __future__ import annotations

import hashlib
import json
import unicodedata
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, inspect, or_, text
from sqlalchemy.orm import Session

from src.api.dependencies import verify_internal_service_token
from src.config import get_settings
from src.database import get_db
from src.models.medical import (
    Appointment,
    AppointmentStatus,
    AuditLog,
    Department,
    Doctor,
    HealthcareFacility,
    IdempotencyRecord,
    Patient,
    PatientUserLink,
    SlotStatus,
    TimeSlot,
)

router = APIRouter(prefix="/api/v1", tags=["healthcare"])

_VIETNAMESE_MOBILE_PATTERN = r"^(?:0|\+84)(?:3|5|7|8|9)\d{8}$"


def _normalize_phone(value: str) -> str:
    return value.strip().replace(" ", "").replace(".", "").replace("(", "").replace(")", "").replace("-", "")


def _is_valid_mobile_phone(value: str) -> bool:
    import re
    return re.fullmatch(_VIETNAMESE_MOBILE_PATTERN, value) is not None


class HoldSlotRequest(BaseModel):
    slot_id: int = Field(ge=1)
    patient_id: int | None = Field(default=None, ge=1)
    symptoms: str = Field(min_length=1, max_length=2000)


class WebhookRequest(BaseModel):
    appointment_id: int = Field(ge=1)


class CreatePatientRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=6, max_length=64)
    relationship: str = Field(default="self", pattern="^(self|child|parent|dependent)$")
    blood_type: str | None = Field(default=None, max_length=16)
    medical_history: str | None = Field(default=None, max_length=4000)

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        normalized = _normalize_phone(value)
        if not _is_valid_mobile_phone(normalized):
            raise ValueError("Số điện thoại Việt Nam không hợp lệ.")
        return normalized


class PatientPatchRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    phone: str | None = Field(default=None, min_length=6, max_length=64)
    relationship: str | None = Field(default=None, pattern="^(self|child|parent|dependent)$")

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = _normalize_phone(value)
        if not _is_valid_mobile_phone(normalized):
            raise ValueError("Số điện thoại Việt Nam không hợp lệ.")
        return normalized


def _require_actor(x_actor_id: str | None) -> str:
    if not x_actor_id:
        raise HTTPException(status_code=401, detail={"code": "ACTOR_REQUIRED", "detail": "Actor identity is required."})
    return x_actor_id


def _require_idempotency_key(value: str | None) -> str:
    if value is None or not value.strip():
        raise HTTPException(
            status_code=400,
            detail={"code": "IDEMPOTENCY_KEY_REQUIRED", "detail": "Idempotency-Key is required for this write."},
        )
    normalized = value.strip()
    if len(normalized) > 255:
        raise HTTPException(
            status_code=422,
            detail={"code": "IDEMPOTENCY_KEY_INVALID", "detail": "Idempotency-Key must be at most 255 characters."},
        )
    return normalized


def _request_hash(operation: str, payload: dict[str, Any]) -> str:
    encoded = json.dumps({"operation": operation, "payload": payload}, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _idempotency_storage_key(actor_id: str, operation: str, key: str) -> str:
    encoded = json.dumps([actor_id, operation, key], ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _active_catalog_version(db: Session) -> str | None:
    # Unit-test and pre-migration schemas may not contain the registry. Check
    # before issuing SQL so a missing optional read never aborts or rolls back
    # the caller's write transaction.
    try:
        if not inspect(db.connection()).has_table("catalog_dataset_versions"):
            return None
        return db.execute(
            text("SELECT dataset_version FROM catalog_dataset_versions WHERE domain='healthcare' AND is_active=TRUE ORDER BY imported_at DESC, dataset_version DESC LIMIT 1")
        ).scalar_one_or_none()
    except Exception:
        # A failed optional catalog-version probe marks the SQLAlchemy
        # transaction as rollback-only. Clear it before callers continue with
        # the authoritative department query.
        db.rollback()
        return None


def _load_idempotency(
    db: Session,
    key: str,
    actor_id: str,
    operation: str,
    request_hash: str,
) -> dict[str, Any] | None:
    storage_key = _idempotency_storage_key(actor_id, operation, key)
    record = db.query(IdempotencyRecord).filter(IdempotencyRecord.idempotency_key == storage_key).first()
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
    key: str,
    actor_id: str,
    operation: str,
    request_hash: str,
    response: dict[str, Any],
) -> None:
    db.add(
        IdempotencyRecord(
            idempotency_key=_idempotency_storage_key(actor_id, operation, key),
            actor_id=actor_id,
            operation=operation,
            request_hash=request_hash,
            response_body=json.dumps(response, ensure_ascii=False),
            status_code=200,
        )
    )


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _iso_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    aware = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    return aware.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _fold_department_name(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value.casefold())
    folded = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return folded.replace("đ", "d")


def _expire_hold(db: Session, slot: TimeSlot | None, appointment: Appointment | None) -> None:
    if slot:
        slot.status = SlotStatus.AVAILABLE.value
        slot.hold_expires_at = None
    if appointment and appointment.status == AppointmentStatus.DRAFT.value:
        appointment.status = AppointmentStatus.EXPIRED.value
        appointment.is_paid = False
        db.add(AuditLog(appointment_id=appointment.id, action="BOOKING_EXPIRED", details="The slot hold expired."))


def _reconcile_expired_holds(db: Session, now: datetime | None = None) -> set[int]:
    """Reconcile expired holds without committing the caller's transaction."""

    current_time = now or _now()
    expired_slots = (
        db.query(TimeSlot)
        .filter(
            TimeSlot.status == SlotStatus.HOLDING.value,
            TimeSlot.hold_expires_at.is_not(None),
            TimeSlot.hold_expires_at <= current_time,
        )
        .with_for_update()
        .all()
    )
    expired_appointment_ids: set[int] = set()
    for slot in expired_slots:
        appointment = (
            db.query(Appointment)
            .filter(Appointment.slot_id == slot.id, Appointment.status == AppointmentStatus.DRAFT.value)
            .with_for_update()
            .first()
        )
        _expire_hold(db, slot, appointment)
        db.info["healthcare_reconciliation_changed"] = True
        if appointment:
            expired_appointment_ids.add(appointment.id)
    return expired_appointment_ids


def _hold_is_active(slot: TimeSlot | None, now: datetime | None = None) -> bool:
    current_time = now or _now()
    return bool(
        slot
        and slot.status == SlotStatus.HOLDING.value
        and slot.hold_expires_at is not None
        and slot.hold_expires_at > current_time
    )


def _commit_reconciliation(db: Session, expired_appointment_ids: set[int]) -> None:
    if expired_appointment_ids or db.info.pop("healthcare_reconciliation_changed", False):
        db.commit()


def _resolve_patient(db: Session, patient_id: int | None, actor_id: str) -> Patient:
    links = db.query(PatientUserLink).filter(PatientUserLink.actor_user_id == actor_id).all()
    if patient_id is not None:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not any(link.patient_id == patient_id for link in links):
            raise HTTPException(status_code=403, detail={"code": "PATIENT_NOT_LINKED", "detail": "The patient is not linked to this account."})
    else:
        default_link = next((link for link in links if link.is_default), None) or (links[0] if links else None)
        patient = db.query(Patient).filter(Patient.id == default_link.patient_id).first() if default_link else db.query(Patient).order_by(Patient.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail={"code": "PATIENT_NOT_FOUND", "detail": "Patient was not found."})
    return patient


def _facility_record_data(facility: HealthcareFacility) -> dict[str, Any]:
    coordinates = {
        "latitude": facility.latitude,
        "longitude": facility.longitude,
        "coordinate_status": "validated" if facility.latitude is not None and facility.longitude is not None else "missing",
    }
    return {
        "source_id": facility.source_id,
        "name": facility.name,
        "address": facility.address,
        "facility_type": facility.facility_type,
        "ward": facility.ward,
        "district": facility.district,
        "city": facility.city,
        **coordinates,
        "phone": facility.phone,
        "website": facility.website,
        "source": facility.source_name or "healthcare_catalog",
    }


def _facility_data(db: Session | None = None, facility_source_id: str | None = None) -> dict[str, Any]:
    if db is not None:
        query = db.query(HealthcareFacility).filter(HealthcareFacility.is_active.is_(True))
        active_version = _active_catalog_version(db)
        if active_version:
            query = query.filter(HealthcareFacility.dataset_version == active_version)
        if facility_source_id:
            query = query.filter(HealthcareFacility.source_id == facility_source_id)
        facility = query.order_by(HealthcareFacility.source_id).first()
        if facility:
            return _facility_record_data(facility)
    settings = get_settings()
    return {
        "name": settings.healthcare_facility_name,
        "address": settings.healthcare_facility_address,
    }


def _appointment_data(appointment: Appointment, db: Session | None = None) -> dict[str, Any]:
    slot = appointment.slot
    doctor = appointment.doctor
    department = doctor.department if doctor else None
    return {
        "appointment_id": appointment.id,
        "actor_id": appointment.actor_id,
        "patient_id": appointment.patient_id,
        "patient": {
            "id": appointment.patient.id,
            "name": appointment.patient.name,
            "phone": appointment.patient.phone,
        } if appointment.patient else None,
        "symptoms": appointment.symptoms,
        "status": appointment.status,
        "is_paid": appointment.is_paid,
        "price": doctor.price if doctor else None,
        "doctor": {
            "id": doctor.id,
            "name": doctor.name,
            "description": doctor.description,
            "price": doctor.price,
            "facility_source_id": doctor.facility_source_id,
        } if doctor else None,
        "department": {
            "id": department.id,
            "name": department.name,
            "description": department.description,
        } if department else None,
        "facility": _facility_data(db, doctor.facility_source_id if doctor else None),
        "slot": {
            "id": slot.id,
            "start_time": _iso_utc(slot.start_time),
            "end_time": _iso_utc(slot.end_time),
            "status": slot.status,
            "hold_expires_at": _iso_utc(slot.hold_expires_at),
        } if slot else None,
    }


@router.get("/departments")
def get_departments(
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
    keyword: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> dict[str, Any]:
    query = db.query(Department).filter(Department.is_active.is_(True))
    active_version = _active_catalog_version(db)
    if active_version:
        query = query.filter(Department.dataset_version == active_version)
    if keyword and keyword.strip():
        k = f"%{keyword.strip()}%"
        # specialty belongs to Doctor, not Department. Referencing it here
        # generates invalid SQL on PostgreSQL and turns department browsing
        # into a 500 whenever a keyword is supplied.
        query = query.filter(or_(Department.name.ilike(k), Department.description.ilike(k)))
    total = query.count()
    # SQLAlchemy does not allow changing the ordering of a sliced query.
    # Apply the deterministic ordering before LIMIT/OFFSET so paginated
    # department requests work on PostgreSQL (and remain stable for ties).
    query = query.order_by(Department.name, Department.id)
    if offset is not None and offset > 0:
        query = query.offset(offset)
    if limit is not None and limit > 0:
        query = query.limit(limit)
    departments = query.all()
    facility_ids = {
        department.facility_source_id
        for department in departments
        if department.facility_source_id
    }
    facilities: dict[str, dict[str, Any]] = {}
    if facility_ids:
        facility_query = db.query(HealthcareFacility).filter(
            HealthcareFacility.is_active.is_(True),
            HealthcareFacility.source_id.in_(facility_ids),
        )
        if active_version:
            facility_query = facility_query.filter(HealthcareFacility.dataset_version == active_version)
        facilities = {facility.source_id: _facility_record_data(facility) for facility in facility_query.all()}
    default_facility = _facility_data(db)
    items = [
        {
            "id": department.id,
            "name": department.name,
            "description": department.description,
            "facility": facilities.get(department.facility_source_id, default_facility),
        }
        for department in departments
    ]
    return {
        "data": {
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    }


@router.get("/facilities/{facility_source_id:path}")
def get_facility(
    facility_source_id: str,
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
) -> dict[str, Any]:
    query = db.query(HealthcareFacility).filter(HealthcareFacility.source_id == facility_source_id, HealthcareFacility.is_active.is_(True))
    active_version = _active_catalog_version(db)
    if active_version:
        query = query.filter(HealthcareFacility.dataset_version == active_version)
    facility = query.first()
    if not facility:
        raise HTTPException(status_code=404, detail={"code": "FACILITY_NOT_FOUND", "detail": "Healthcare facility was not found."})
    return {"data": _facility_data(db, facility_source_id)}


@router.get("/patients")
def get_patients(
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
    x_actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
) -> dict[str, Any]:
    actor_id = _require_actor(x_actor_id)
    links = (
        db.query(PatientUserLink)
        .filter(PatientUserLink.actor_user_id == actor_id)
        .order_by(PatientUserLink.is_default.desc(), PatientUserLink.created_at.asc())
        .all()
    )
    return {"data": {"items": [{"id": link.patient.id, "name": link.patient.name, "phone": link.patient.phone, "relationship": link.relationship_type, "is_default": link.is_default} for link in links]}}


@router.post("/patients")
def create_patient(
    request: CreatePatientRequest,
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
    x_actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict[str, Any]:
    actor_id = _require_actor(x_actor_id)
    key = _require_idempotency_key(idempotency_key)
    operation = "healthcare.patient.create"
    payload = request.model_dump()
    request_hash = _request_hash(operation, payload)
    cached = _load_idempotency(db, key, actor_id, operation, request_hash)
    if cached is not None:
        return {"data": cached}
    try:
        if request.relationship == "self":
            existing_self_link = (
                db.query(PatientUserLink)
                .filter(
                    PatientUserLink.actor_user_id == actor_id,
                    PatientUserLink.relationship_type == "self",
                )
                .order_by(PatientUserLink.is_default.desc(), PatientUserLink.created_at.asc())
                .first()
            )
            if existing_self_link is not None:
                existing_self_link.patient.name = request.name.strip()
                existing_self_link.patient.phone = request.phone.strip()
                if request.blood_type is not None:
                    existing_self_link.patient.blood_type = request.blood_type
                if request.medical_history is not None:
                    existing_self_link.patient.medical_history = request.medical_history
                response = {
                    "id": existing_self_link.patient.id,
                    "name": existing_self_link.patient.name,
                    "phone": existing_self_link.patient.phone,
                    "relationship": existing_self_link.relationship_type,
                    "is_default": existing_self_link.is_default,
                }
                _save_idempotency(db, key, actor_id, operation, request_hash, response)
                db.commit()
                return {"data": response}
        patient = Patient(name=request.name.strip(), phone=request.phone.strip(), blood_type=request.blood_type, medical_history=request.medical_history)
        db.add(patient)
        db.flush()
        has_default = db.query(PatientUserLink).filter(PatientUserLink.actor_user_id == actor_id, PatientUserLink.is_default.is_(True)).first() is not None
        link = PatientUserLink(actor_user_id=actor_id, patient_id=patient.id, relationship_type=request.relationship, is_default=not has_default)
        db.add(link)
        db.flush()
        response = {"id": patient.id, "name": patient.name, "phone": patient.phone, "relationship": link.relationship_type, "is_default": link.is_default}
        _save_idempotency(db, key, actor_id, operation, request_hash, response)
        db.commit()
        return {"data": response}
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail={"code": "PATIENT_CREATE_FAILED", "detail": "Unable to create the patient profile."}) from None


@router.post("/patients/{patient_id}/default")
def set_default_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
    x_actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict[str, Any]:
    actor_id = _require_actor(x_actor_id)
    key = _require_idempotency_key(idempotency_key)
    operation = "healthcare.patient.default"
    request_hash = _request_hash(operation, {"patient_id": patient_id})
    cached = _load_idempotency(db, key, actor_id, operation, request_hash)
    if cached is not None:
        return {"data": cached}
    link = db.query(PatientUserLink).filter(PatientUserLink.actor_user_id == actor_id, PatientUserLink.patient_id == patient_id).first()
    if link is None:
        raise HTTPException(status_code=404, detail={"code": "PATIENT_NOT_LINKED", "detail": "The patient is not linked to this account."})
    db.query(PatientUserLink).filter(PatientUserLink.actor_user_id == actor_id).update({"is_default": False})
    link.is_default = True
    response = {"id": link.patient.id, "name": link.patient.name, "phone": link.patient.phone, "relationship": link.relationship_type, "is_default": True}
    _save_idempotency(db, key, actor_id, operation, request_hash, response)
    db.commit()
    return {"data": response}


@router.patch("/patients/{patient_id}")
def update_patient(
    patient_id: int,
    request: PatientPatchRequest,
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
    x_actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict[str, Any]:
    actor_id = _require_actor(x_actor_id)
    key = _require_idempotency_key(idempotency_key)
    payload = request.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail={"code": "PATIENT_PATCH_EMPTY", "detail": "At least one patient field is required."})
    operation = "healthcare.patient.update"
    request_hash = _request_hash(operation, {"patient_id": patient_id, **payload})
    cached = _load_idempotency(db, key, actor_id, operation, request_hash)
    if cached is not None:
        return {"data": cached}
    link = db.query(PatientUserLink).filter(PatientUserLink.actor_user_id == actor_id, PatientUserLink.patient_id == patient_id).first()
    if link is None:
        raise HTTPException(status_code=404, detail={"code": "PATIENT_NOT_LINKED", "detail": "The patient is not linked to this account."})
    if "name" in payload:
        link.patient.name = str(payload["name"]).strip()
    if "phone" in payload:
        link.patient.phone = str(payload["phone"])
    if "relationship" in payload:
        target_rel = str(payload["relationship"])
        if target_rel == "self":
            existing_self = (
                db.query(PatientUserLink)
                .filter(
                    PatientUserLink.actor_user_id == actor_id,
                    PatientUserLink.relationship_type == "self",
                    PatientUserLink.patient_id != patient_id,
                )
                .first()
            )
            if existing_self is not None:
                raise HTTPException(status_code=409, detail={"code": "SELF_PATIENT_EXISTS", "detail": "Hồ sơ bản thân đã tồn tại trong tài khoản."})
        link.relationship_type = target_rel
    response = {"id": link.patient.id, "name": link.patient.name, "phone": link.patient.phone, "relationship": link.relationship_type, "is_default": link.is_default}
    _save_idempotency(db, key, actor_id, operation, request_hash, response)
    db.commit()
    return {"data": response}


@router.delete("/patients/{patient_id}")
def unlink_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
    x_actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict[str, Any]:
    actor_id = _require_actor(x_actor_id)
    key = _require_idempotency_key(idempotency_key)
    operation = "healthcare.patient.unlink"
    request_hash = _request_hash(operation, {"patient_id": patient_id})
    cached = _load_idempotency(db, key, actor_id, operation, request_hash)
    if cached is not None:
        return {"data": cached}
    link = db.query(PatientUserLink).filter(PatientUserLink.actor_user_id == actor_id, PatientUserLink.patient_id == patient_id).first()
    if link is None:
        raise HTTPException(status_code=404, detail={"code": "PATIENT_NOT_LINKED", "detail": "The patient is not linked to this account."})
    was_default = link.is_default
    db.delete(link)
    db.flush()
    replacement = None
    if was_default:
        replacement = db.query(PatientUserLink).filter(PatientUserLink.actor_user_id == actor_id).order_by(PatientUserLink.created_at.asc(), PatientUserLink.id.asc()).first()
        if replacement is not None:
            replacement.is_default = True
    response = {"deleted": True, "id": patient_id, "replacement_default_id": replacement.patient_id if replacement is not None else None}
    _save_idempotency(db, key, actor_id, operation, request_hash, response)
    db.commit()
    return {"data": response}


@router.get("/doctors")
def get_doctors_by_department(
    department: str,
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
) -> dict[str, Any]:
    expired_appointment_ids = _reconcile_expired_holds(db)
    folded_department = _fold_department_name(department)
    department_query = db.query(Department).filter(Department.is_active.is_(True))
    active_version = _active_catalog_version(db)
    if active_version:
        department_query = department_query.filter(Department.dataset_version == active_version)
    department_records = [candidate for candidate in department_query.order_by(Department.name).all() if folded_department in _fold_department_name(candidate.name)]
    if not department_records:
        _commit_reconciliation(db, expired_appointment_ids)
        raise HTTPException(status_code=404, detail={"code": "DEPARTMENT_NOT_FOUND", "detail": "Department was not found."})

    doctors: list[dict[str, Any]] = []
    for department_record in department_records:
        doctor_query = db.query(Doctor).filter(Doctor.department_id == department_record.id, Doctor.is_active.is_(True), Doctor.facility_source_id == department_record.facility_source_id)
        if active_version:
            doctor_query = doctor_query.filter(Doctor.dataset_version == active_version)
        for doctor in doctor_query.order_by(Doctor.name).all():
            slots = (
                db.query(TimeSlot)
                .filter(
                    TimeSlot.doctor_id == doctor.id,
                    TimeSlot.status == SlotStatus.AVAILABLE.value,
                    TimeSlot.start_time > func.now(),
                )
                .order_by(TimeSlot.start_time)
                .all()
            )
            doctors.append(
                {
                    "id": doctor.id,
                    "name": doctor.name,
                    "price": doctor.price,
                    "description": doctor.description,
                    "title": doctor.title,
                    "specialty": doctor.specialty,
                    "facility": _facility_data(db, doctor.facility_source_id),
                    "department": {
                        "id": department_record.id,
                        "name": department_record.name,
                        "description": department_record.description,
                    },
                    "available_slots": [
                        {
                            "id": slot.id,
                            "start_time": _iso_utc(slot.start_time),
                            "end_time": _iso_utc(slot.end_time),
                        }
                        for slot in slots
                    ],
                }
            )
    _commit_reconciliation(db, expired_appointment_ids)
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
    key = _require_idempotency_key(idempotency_key)
    operation = "healthcare.hold_slot"
    payload = request.model_dump()
    request_hash = _request_hash(operation, payload)
    cached = _load_idempotency(db, key, actor_id, operation, request_hash)
    if cached is not None:
        return {"data": cached}

    try:
        _reconcile_expired_holds(db)
        patient = _resolve_patient(db, request.patient_id, actor_id)
        slot = db.query(TimeSlot).filter(TimeSlot.id == request.slot_id).with_for_update().first()
        if not slot:
            raise HTTPException(status_code=404, detail={"code": "SLOT_NOT_FOUND", "detail": "Time slot was not found."})
        if slot.status != SlotStatus.AVAILABLE.value:
            raise HTTPException(status_code=409, detail={"code": "SLOT_UNAVAILABLE", "detail": "Time slot is not available."})
        if slot.doctor is None or slot.doctor.price is None:
            raise HTTPException(status_code=422, detail={"code": "DOCTOR_PRICE_UNAVAILABLE", "detail": "This doctor does not have an authoritative consultation price yet."})

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
            "start_time": _iso_utc(slot.start_time),
            "end_time": _iso_utc(slot.end_time),
            "status": AppointmentStatus.DRAFT.value,
            "is_paid": False,
            "hold_expires_at": _iso_utc(slot.hold_expires_at),
            "facility": _facility_data(db, slot.doctor.facility_source_id if slot.doctor else None),
        }
        _save_idempotency(db, key, actor_id, operation, request_hash, response)
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
    expired_appointment_ids = _reconcile_expired_holds(db)
    appointment = (
        db.query(Appointment)
        .filter(Appointment.id == appointment_id, Appointment.actor_id == actor_id)
        .first()
    )
    if not appointment:
        _commit_reconciliation(db, expired_appointment_ids)
        raise HTTPException(status_code=404, detail={"code": "APPOINTMENT_NOT_FOUND", "detail": "Appointment was not found."})
    _commit_reconciliation(db, expired_appointment_ids)
    return {"data": _appointment_data(appointment, db)}


@router.get("/appointments")
def list_appointments(
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
    x_actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
) -> dict[str, Any]:
    actor_id = _require_actor(x_actor_id)
    expired_appointment_ids = _reconcile_expired_holds(db)
    appointments = db.query(Appointment).filter(Appointment.actor_id == actor_id).order_by(Appointment.id.desc()).all()
    _commit_reconciliation(db, expired_appointment_ids)
    return {"data": {"items": [_appointment_data(appointment, db) for appointment in appointments]}}


@router.get("/internal/ops/summary")
def ops_summary(
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
) -> dict[str, Any]:
    active_version = _active_catalog_version(db)
    facility_query = db.query(HealthcareFacility).filter(HealthcareFacility.is_active.is_(True))
    doctor_query = db.query(Doctor).filter(Doctor.is_active.is_(True))
    if active_version:
        facility_query = facility_query.filter(HealthcareFacility.dataset_version == active_version)
        doctor_query = doctor_query.filter(Doctor.dataset_version == active_version)
    rows = db.query(Appointment.status, func.count(Appointment.id)).group_by(Appointment.status).all()
    by_status = {str(status): int(count) for status, count in rows}
    return {"data": {"domain": "healthcare", "counts": {"appointments": sum(by_status.values()), "appointments_by_status": by_status, "facilities": int(facility_query.count()), "doctors": int(doctor_query.count())}}}


@router.get("/internal/ops/dataset-status")
def ops_dataset_status(
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
) -> dict[str, Any]:
    active_version = _active_catalog_version(db)
    facilities_query = db.query(HealthcareFacility).filter(HealthcareFacility.is_active.is_(True))
    if active_version:
        facilities_query = facilities_query.filter(HealthcareFacility.dataset_version == active_version)
    facilities = facilities_query.order_by(HealthcareFacility.last_verified_at.desc()).all()
    latest = facilities[0] if facilities else None
    return {"data": {"dataset_version": active_version, "source_name": latest.source_name if latest else None, "imported_at": latest.fetched_at.isoformat() if latest and latest.fetched_at else None, "last_verified_at": latest.last_verified_at.isoformat() if latest and latest.last_verified_at else None, "active": bool(facilities), "row_count": len(facilities), "quality_warnings": [], "rejected_count": 0}}


@router.get("/internal/ops/transactions")
def ops_transactions(
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
) -> dict[str, Any]:
    safe_limit = min(max(limit, 1), 100)
    safe_offset = max(offset, 0)
    appointments = db.query(Appointment).order_by(Appointment.created_at.desc()).offset(safe_offset).limit(safe_limit).all()
    total = int(db.query(func.count(Appointment.id)).scalar() or 0)
    items = [{"appointment_id": item.id, "actor_id": item.actor_id, "status": item.status, "is_paid": item.is_paid, "doctor_id": item.doctor_id, "slot_id": item.slot_id, "created_at": item.created_at.isoformat() if item.created_at else None} for item in appointments]
    return {"data": {"items": items, "total": total, "limit": safe_limit, "offset": safe_offset}}


@router.post("/appointments/{appointment_id}/confirm")
def confirm_booking(
    appointment_id: int,
    db: Session = Depends(get_db),
    _internal_token: str = Depends(verify_internal_service_token),
    x_actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict[str, Any]:
    actor_id = _require_actor(x_actor_id)
    key = _require_idempotency_key(idempotency_key)
    operation = "healthcare.confirm_appointment"
    payload = {"appointment_id": appointment_id}
    request_hash = _request_hash(operation, payload)
    cached = _load_idempotency(db, key, actor_id, operation, request_hash)
    if cached is not None:
        return {"data": cached}

    try:
        expired_appointment_ids = _reconcile_expired_holds(db)
        appointment = (
            db.query(Appointment)
            .filter(Appointment.id == appointment_id, Appointment.actor_id == actor_id)
            .with_for_update()
            .first()
        )
        if not appointment:
            raise HTTPException(status_code=404, detail={"code": "APPOINTMENT_NOT_FOUND", "detail": "Appointment was not found."})
        if appointment.status == AppointmentStatus.EXPIRED.value:
            _commit_reconciliation(db, {appointment.id} & expired_appointment_ids)
            raise HTTPException(status_code=409, detail={"code": "APPOINTMENT_EXPIRED", "detail": "The appointment hold has expired."})
        if appointment.status == AppointmentStatus.CONFIRMED.value:
            raise HTTPException(status_code=409, detail={"code": "APPOINTMENT_ALREADY_CONFIRMED", "detail": "Appointment is already confirmed."})
        if appointment.status != AppointmentStatus.DRAFT.value:
            raise HTTPException(status_code=409, detail={"code": "APPOINTMENT_NOT_CONFIRMABLE", "detail": "Only an active appointment hold can be confirmed."})
        if not appointment.is_paid:
            raise HTTPException(status_code=409, detail={"code": "PAYMENT_REQUIRED", "detail": "Appointment payment is required before confirmation."})

        slot = db.query(TimeSlot).filter(TimeSlot.id == appointment.slot_id).with_for_update().first()
        if not _hold_is_active(slot):
            _expire_hold(db, slot, appointment)
            db.commit()
            raise HTTPException(status_code=409, detail={"code": "APPOINTMENT_EXPIRED", "detail": "The appointment hold has expired."})
        appointment.status = AppointmentStatus.CONFIRMED.value
        slot.status = SlotStatus.BOOKED.value
        slot.hold_expires_at = None
        db.add(AuditLog(appointment_id=appointment.id, action="BOOKING_CONFIRMED", details="Booking confirmed."))
        response = {"status": "success", "appointment_id": appointment.id, "message": "Booking confirmed.", "appointment": _appointment_data(appointment, db)}
        _save_idempotency(db, key, actor_id, operation, request_hash, response)
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
    key = _require_idempotency_key(idempotency_key)
    operation = "healthcare.cancel_appointment"
    payload = {"appointment_id": appointment_id}
    request_hash = _request_hash(operation, payload)
    cached = _load_idempotency(db, key, actor_id, operation, request_hash)
    if cached is not None:
        return {"data": cached}

    try:
        expired_appointment_ids = _reconcile_expired_holds(db)
        appointment = (
            db.query(Appointment)
            .filter(Appointment.id == appointment_id, Appointment.actor_id == actor_id)
            .with_for_update()
            .first()
        )
        if not appointment:
            raise HTTPException(status_code=404, detail={"code": "APPOINTMENT_NOT_FOUND", "detail": "Appointment was not found."})
        if appointment.status == AppointmentStatus.EXPIRED.value:
            _commit_reconciliation(db, {appointment.id} & expired_appointment_ids)
            raise HTTPException(status_code=409, detail={"code": "APPOINTMENT_EXPIRED", "detail": "The appointment hold has expired."})
        if appointment.status == AppointmentStatus.CANCELLED.value:
            raise HTTPException(status_code=409, detail={"code": "APPOINTMENT_ALREADY_CANCELLED", "detail": "Appointment is already cancelled."})
        if appointment.status not in {AppointmentStatus.DRAFT.value, AppointmentStatus.CONFIRMED.value}:
            raise HTTPException(status_code=409, detail={"code": "APPOINTMENT_NOT_CANCELLABLE", "detail": "The appointment cannot be cancelled in its current state."})

        slot = db.query(TimeSlot).filter(TimeSlot.id == appointment.slot_id).with_for_update().first()
        if not slot:
            raise HTTPException(status_code=409, detail={"code": "APPOINTMENT_NOT_CANCELLABLE", "detail": "The appointment slot is unavailable."})
        if appointment.status == AppointmentStatus.DRAFT.value and not _hold_is_active(slot):
            _expire_hold(db, slot, appointment)
            db.commit()
            raise HTTPException(status_code=409, detail={"code": "APPOINTMENT_EXPIRED", "detail": "The appointment hold has expired."})
        appointment.status = AppointmentStatus.CANCELLED.value
        slot.status = SlotStatus.AVAILABLE.value
        slot.hold_expires_at = None
        db.add(AuditLog(appointment_id=appointment.id, action="BOOKING_CANCELLED", details="Booking cancelled."))
        response = {
            "status": "success",
            "appointment_id": appointment.id,
            "slot_id": slot.id,
            "slot_status": slot.status,
            "message": "Booking cancelled.",
        }
        _save_idempotency(db, key, actor_id, operation, request_hash, response)
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
    key = _require_idempotency_key(idempotency_key)
    operation = "healthcare.payment.acknowledge"
    payload = request.model_dump()
    request_hash = _request_hash(operation, payload)
    cached = _load_idempotency(db, key, actor_id, operation, request_hash)
    if cached is not None:
        return {"data": cached}
    try:
        expired_appointment_ids = _reconcile_expired_holds(db)
        appointment = (
            db.query(Appointment)
            .filter(Appointment.id == request.appointment_id, Appointment.actor_id == actor_id)
            .with_for_update()
            .first()
        )
        if not appointment:
            raise HTTPException(status_code=404, detail={"code": "APPOINTMENT_NOT_FOUND", "detail": "Appointment was not found."})
        if appointment.status == AppointmentStatus.EXPIRED.value:
            _commit_reconciliation(db, {appointment.id} & expired_appointment_ids)
            raise HTTPException(status_code=409, detail={"code": "APPOINTMENT_EXPIRED", "detail": "The appointment hold has expired."})
        if appointment.status != AppointmentStatus.DRAFT.value:
            raise HTTPException(status_code=409, detail={"code": "APPOINTMENT_NOT_PAYABLE", "detail": "Only a draft appointment can receive payment acknowledgement."})
        slot = db.query(TimeSlot).filter(TimeSlot.id == appointment.slot_id).with_for_update().first()
        if not _hold_is_active(slot):
            _expire_hold(db, slot, appointment)
            db.commit()
            code = "APPOINTMENT_EXPIRED" if appointment.status == AppointmentStatus.EXPIRED.value else "APPOINTMENT_NOT_PAYABLE"
            raise HTTPException(status_code=409, detail={"code": code, "detail": "The appointment hold is no longer payable."})
        appointment.is_paid = True
        db.add(AuditLog(appointment_id=appointment.id, action="PAYMENT_ACKNOWLEDGED", details="Local payment acknowledgement accepted while the hold was active."))
        response = {
            "status": "success",
            "appointment_id": appointment.id,
            "is_paid": True,
            "message": "Appointment marked as paid.",
        }
        _save_idempotency(db, key, actor_id, operation, request_hash, response)
        db.commit()
        return {"data": response}
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail={"code": "HEALTHCARE_PAYMENT_FAILED", "detail": "Unable to acknowledge the appointment payment."}) from None
