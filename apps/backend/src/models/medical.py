from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum as SQLEnum, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from src.database import Base

class SlotStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    HOLDING = "HOLDING"
    BOOKED = "BOOKED"

class AppointmentStatus(str, enum.Enum):
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
    price = Column(Float, nullable=False)
    description = Column(Text, nullable=True)

    department = relationship("Department", back_populates="doctors")
    slots = relationship("TimeSlot", back_populates="doctor")
    appointments = relationship("Appointment", back_populates="doctor")

class TimeSlot(Base):
    __tablename__ = "time_slots"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    status = Column(SQLEnum(SlotStatus), default=SlotStatus.AVAILABLE, nullable=False)
    
    # We'll use pessimistic locking (e.g. with_for_update) in the crud layer to safely update status.

    doctor = relationship("Doctor", back_populates="slots")
    appointment = relationship("Appointment", back_populates="slot", uselist=False)

class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    patient_name = Column(String, nullable=False)
    patient_phone = Column(String, nullable=False)
    symptoms = Column(Text, nullable=True)
    
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)
    slot_id = Column(Integer, ForeignKey("time_slots.id"), nullable=False)
    
    status = Column(SQLEnum(AppointmentStatus), default=AppointmentStatus.DRAFT, nullable=False)
    is_paid = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

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
