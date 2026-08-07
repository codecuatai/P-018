from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from src.database import Base


class SlotStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    HOLDING = "HOLDING"
    BOOKED = "BOOKED"

class AppointmentStatus(StrEnum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"

class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)

    doctors = relationship("Doctor", back_populates="department")

class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    name = Column(String, nullable=False)
    price = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)

    department = relationship("Department", back_populates="doctors")
    slots = relationship("TimeSlot", back_populates="doctor")
    appointments = relationship("Appointment", back_populates="doctor")

class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    blood_type = Column(String, nullable=True)
    medical_history = Column(Text, nullable=True)

    appointments = relationship("Appointment", back_populates="patient")

class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"

    idempotency_key = Column(String, primary_key=True, index=True)
    actor_id = Column(String(128), nullable=False)
    operation = Column(String(80), nullable=False)
    request_hash = Column(String(64), nullable=False)
    response_body = Column(Text, nullable=False)
    status_code = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class TimeSlot(Base):
    __tablename__ = "time_slots"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    status = Column(String(16), default=SlotStatus.AVAILABLE.value, nullable=False)
    hold_expires_at = Column(DateTime, nullable=True)

    doctor = relationship("Doctor", back_populates="slots")
    appointment = relationship("Appointment", back_populates="slot", uselist=False)

class Appointment(Base):
    __tablename__ = "appointments"

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
    slot = relationship("TimeSlot", back_populates="appointment")
    audit_logs = relationship("AuditLog", back_populates="appointment")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=False)
    action = Column(String, nullable=False) # e.g. "SLOT_HELD", "BOOKING_CONFIRMED"
    timestamp = Column(DateTime, default=datetime.utcnow)
    details = Column(Text, nullable=True)

    appointment = relationship("Appointment", back_populates="audit_logs")
