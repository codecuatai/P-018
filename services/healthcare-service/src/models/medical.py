from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from src.database import Base

PROVENANCE_TYPE = JSON().with_variant(JSONB, "postgresql")


class SlotStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    HOLDING = "HOLDING"
    BOOKED = "BOOKED"


class HealthcareFacility(Base):
    __tablename__ = "healthcare_facilities"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    facility_type = Column(String(80), nullable=True)
    address = Column(String(500), nullable=True)
    ward = Column(String(255), nullable=True)
    district = Column(String(255), nullable=True)
    city = Column(String(255), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    phone = Column(String(64), nullable=True)
    website = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    emergency_available = Column(Boolean, nullable=True)
    opening_hours = Column(String(255), nullable=True)
    image_url = Column(String(500), nullable=True)
    source_name = Column(String(255), nullable=True)
    source_url = Column(String(500), nullable=True)
    fetched_at = Column(DateTime, nullable=True)

    departments = relationship("Department", back_populates="facility")
    doctors = relationship("Doctor", back_populates="facility")

class AppointmentStatus(StrEnum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"

class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(String(255), nullable=True, index=True)
    facility_id = Column(Integer, ForeignKey("healthcare_facilities.id"), nullable=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    source_id = Column(String(255), nullable=True, unique=True)
    facility_source_id = Column(String(255), nullable=True)
    source_name = Column(String(120), nullable=True)
    source_url = Column(String(800), nullable=True)
    fetched_at = Column(DateTime, nullable=True)
    last_verified_at = Column(DateTime, nullable=True)
    dataset_version = Column(String(120), nullable=True)
    content_hash = Column(String(64), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    provenance_json = Column(PROVENANCE_TYPE, nullable=True)

    facility = relationship("HealthcareFacility", back_populates="departments")
    doctors = relationship("Doctor", back_populates="department")

class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    source_id = Column(String(255), unique=True, nullable=True, index=True)
    facility_id = Column(Integer, ForeignKey("healthcare_facilities.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    price = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    source_id = Column(String(255), nullable=True, unique=True)
    facility_source_id = Column(String(255), nullable=True)
    title = Column(String(255), nullable=True)
    specialty = Column(Text, nullable=True)
    source_name = Column(String(120), nullable=True)
    source_url = Column(String(800), nullable=True)
    fetched_at = Column(DateTime, nullable=True)
    last_verified_at = Column(DateTime, nullable=True)
    dataset_version = Column(String(120), nullable=True)
    content_hash = Column(String(64), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    provenance_json = Column(PROVENANCE_TYPE, nullable=True)

    department = relationship("Department", back_populates="doctors")
    facility = relationship("HealthcareFacility", back_populates="doctors")
    slots = relationship("TimeSlot", back_populates="doctor")
    appointments = relationship("Appointment", back_populates="doctor")

class HealthcareFacility(Base):
    __tablename__ = "healthcare_facilities"

    source_id = Column(String(255), primary_key=True)
    name = Column(String(255), nullable=False)
    facility_type = Column(String(120), nullable=True)
    address = Column(Text, nullable=False)
    ward = Column(String(120), nullable=True)
    district = Column(String(120), nullable=True)
    city = Column(String(120), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    phone = Column(String(64), nullable=True)
    website = Column(String(800), nullable=True)
    description = Column(Text, nullable=True)
    emergency_available = Column(Boolean, nullable=True)
    opening_hours = Column(Text, nullable=True)
    image_url = Column(String(800), nullable=True)
    source_name = Column(String(120), nullable=True)
    source_url = Column(String(800), nullable=True)
    fetched_at = Column(DateTime, nullable=True)
    last_verified_at = Column(DateTime, nullable=True)
    dataset_version = Column(String(120), nullable=True)
    content_hash = Column(String(64), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    provenance_json = Column(PROVENANCE_TYPE, nullable=True)

class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    blood_type = Column(String, nullable=True)
    medical_history = Column(Text, nullable=True)

    appointments = relationship("Appointment", back_populates="patient")
    user_links = relationship("PatientUserLink", back_populates="patient")


class PatientUserLink(Base):
    __tablename__ = "patient_user_links"
    __table_args__ = (UniqueConstraint("actor_user_id", "patient_id", name="uq_patient_user_links_actor_patient"),)

    id = Column(Integer, primary_key=True, index=True)
    actor_user_id = Column(String(128), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    relationship_type = Column("relationship", String(24), nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    patient = relationship("Patient", back_populates="user_links")

class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"

    # The stored key is a deterministic digest of actor + operation + client
    # key.  Keeping the scoped identity in one bounded primary-key column lets
    # different actors use the same client key without sharing a replay.
    idempotency_key = Column(String(255), primary_key=True, index=True)
    actor_id = Column(String(128), nullable=False)
    operation = Column(String(80), nullable=False)
    request_hash = Column(String(64), nullable=False)
    response_body = Column(Text, nullable=False)
    status_code = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class TimeSlot(Base):
    __tablename__ = "time_slots"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    status = Column(String(16), default=SlotStatus.AVAILABLE.value, nullable=False)
    hold_expires_at = Column(DateTime, nullable=True)

    doctor = relationship("Doctor", back_populates="slots")
    appointments = relationship("Appointment", back_populates="slot")

class Appointment(Base):
    __tablename__ = "appointments"
    __table_args__ = (
        CheckConstraint(
            "status IN ('DRAFT', 'CONFIRMED', 'CANCELLED', 'EXPIRED')",
            name="appointments_status_check",
        ),
        Index(
            "uq_appointments_active_slot",
            "slot_id",
            unique=True,
            postgresql_where=text("status IN ('DRAFT', 'CONFIRMED')"),
            sqlite_where=text("status IN ('DRAFT', 'CONFIRMED')"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(String(128), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    symptoms = Column(Text, nullable=True)

    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)
    slot_id = Column(Integer, ForeignKey("time_slots.id"), nullable=False)

    status = Column(String(16), default=AppointmentStatus.DRAFT.value, nullable=False)
    is_paid = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="appointments")
    doctor = relationship("Doctor", back_populates="appointments")
    slot = relationship("TimeSlot", back_populates="appointments")
    audit_logs = relationship("AuditLog", back_populates="appointment")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=False)
    action = Column(String, nullable=False) # e.g. "SLOT_HELD", "BOOKING_CONFIRMED"
    timestamp = Column(DateTime, default=datetime.utcnow)
    details = Column(Text, nullable=True)

    appointment = relationship("Appointment", back_populates="audit_logs")
