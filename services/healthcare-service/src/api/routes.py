from fastapi import APIRouter, HTTPException, Depends, Header
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
import json

from src.database import get_db
from src.models.medical import Department, Doctor, TimeSlot, Appointment, AuditLog, SlotStatus, AppointmentStatus, Patient, IdempotencyRecord
from src.config import get_settings

router = APIRouter(prefix="/api/v1")

class HoldSlotRequest(BaseModel):
    slot_id: int
    patient_id: int
    symptoms: str

class WebhookRequest(BaseModel):
    appointment_id: int

def verify_token(x_internal_token: Optional[str] = Header(None)):
    settings = get_settings()
    if x_internal_token != settings.internal_service_token:
        raise HTTPException(status_code=403, detail="Invalid internal service token")

def check_idempotency(db: Session, key: str):
    if not key:
        return None
    record = db.query(IdempotencyRecord).filter(IdempotencyRecord.idempotency_key == key).first()
    if record:
        return json.loads(record.response_body)
    return None

def save_idempotency(db: Session, key: str, response: dict, status_code: int = 200):
    if key:
        record = IdempotencyRecord(
            idempotency_key=key,
            response_body=json.dumps(response),
            status_code=status_code
        )
        db.add(record)
        db.commit()

def release_expired_slots(db: Session):
    expired_slots = db.query(TimeSlot).filter(
        TimeSlot.status == SlotStatus.HOLDING,
        TimeSlot.hold_expires_at < datetime.utcnow()
    ).all()
    for s in expired_slots:
        s.status = SlotStatus.AVAILABLE
        s.hold_expires_at = None
        app = db.query(Appointment).filter(Appointment.slot_id == s.id, Appointment.status == AppointmentStatus.DRAFT).first()
        if app:
            app.status = AppointmentStatus.CANCELLED
    if expired_slots:
        db.commit()

@router.get("/departments")
def get_departments(db: Session = Depends(get_db)):
    depts = db.query(Department).all()
    return [{"id": d.id, "name": d.name, "description": d.description} for d in depts]

@router.get("/doctors")
def get_doctors_by_department(department: str, db: Session = Depends(get_db)):
    release_expired_slots(db)
    
    dept = db.query(Department).filter(Department.name.ilike(f"%{department}%")).first()
    if not dept:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy chuyên khoa nào tên '{department}'.")
    
    doctors = db.query(Doctor).filter(Doctor.department_id == dept.id).all()
    
    result = []
    for doc in doctors:
        slots = db.query(TimeSlot).filter(
            TimeSlot.doctor_id == doc.id,
            TimeSlot.status == SlotStatus.AVAILABLE
        ).order_by(TimeSlot.start_time).all()
        
        doc_data = {
            "id": doc.id,
            "name": doc.name,
            "price": doc.price,
            "description": doc.description,
            "available_slots": [{"id": s.id, "start_time": s.start_time.strftime("%Y-%m-%d %H:%M")} for s in slots]
        }
        result.append(doc_data)
        
    return result

@router.post("/slots/hold")
def hold_slot(req: HoldSlotRequest, db: Session = Depends(get_db), x_internal_token: str = Depends(verify_token), idempotency_key: Optional[str] = Header(None)):
    cached = check_idempotency(db, idempotency_key)
    if cached: return cached

    release_expired_slots(db)
    
    try:
        slot = db.query(TimeSlot).filter(TimeSlot.id == req.slot_id).with_for_update().first()
        if not slot:
            raise HTTPException(status_code=404, detail=f"Lỗi: Không tìm thấy Slot ID {req.slot_id}.")
        if slot.status != SlotStatus.AVAILABLE:
            raise HTTPException(status_code=400, detail="Lỗi: Khung giờ này đã được đặt hoặc đang giữ chỗ.")
            
        slot.status = SlotStatus.HOLDING
        slot.hold_expires_at = datetime.utcnow() + timedelta(minutes=10)
        
        appointment = Appointment(
            patient_id=req.patient_id,
            symptoms=req.symptoms,
            doctor_id=slot.doctor_id,
            slot_id=slot.id,
            status=AppointmentStatus.DRAFT
        )
        db.add(appointment)
        db.commit()
        db.refresh(appointment)
        
        res = {
            "appointment_id": appointment.id,
            "doctor_name": slot.doctor.name,
            "start_time": slot.start_time.strftime('%Y-%m-%d %H:%M')
        }
        save_idempotency(db, idempotency_key, res)
        return res
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/appointments/{appointment_id}/confirm")
def confirm_booking(appointment_id: int, db: Session = Depends(get_db), x_internal_token: str = Depends(verify_token), idempotency_key: Optional[str] = Header(None)):
    cached = check_idempotency(db, idempotency_key)
    if cached: return cached
    
    try:
        appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
        if not appointment:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy Lịch hẹn số {appointment_id}.")
            
        if appointment.status == AppointmentStatus.CONFIRMED:
            raise HTTPException(status_code=400, detail="Lịch hẹn này đã được xác nhận từ trước.")
            
        if not appointment.is_paid:
            raise HTTPException(status_code=400, detail=f"TỪ CHỐI CHỐT LỊCH: Lịch hẹn số {appointment_id} chưa thanh toán.")
            
        slot = appointment.slot
        appointment.status = AppointmentStatus.CONFIRMED
        if slot:
            slot.status = SlotStatus.BOOKED
            slot.hold_expires_at = None
            
        audit_log = AuditLog(
            appointment_id=appointment.id,
            action="BOOKING_CONFIRMED",
            details=f"Booking confirmed for appointment {appointment.id}."
        )
        db.add(audit_log)
        db.commit()
        
        res = {"status": "success", "message": "Booking confirmed"}
        save_idempotency(db, idempotency_key, res)
        return res
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/appointments/{appointment_id}/cancel")
def cancel_booking(appointment_id: int, db: Session = Depends(get_db), x_internal_token: str = Depends(verify_token), idempotency_key: Optional[str] = Header(None)):
    cached = check_idempotency(db, idempotency_key)
    if cached: return cached
    
    try:
        appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
        if not appointment:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy Lịch hẹn số {appointment_id}.")
            
        if appointment.status == AppointmentStatus.CANCELLED:
            raise HTTPException(status_code=400, detail="Lịch hẹn này đã bị hủy từ trước.")
            
        slot = appointment.slot
        appointment.status = AppointmentStatus.CANCELLED
        if slot:
            slot.status = SlotStatus.AVAILABLE
            slot.hold_expires_at = None
            
        audit_log = AuditLog(
            appointment_id=appointment.id,
            action="BOOKING_CANCELLED",
            details=f"Booking cancelled."
        )
        db.add(audit_log)
        db.commit()
        
        res = {"status": "success", "message": "Booking cancelled"}
        save_idempotency(db, idempotency_key, res)
        return res
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/payment/webhook")
def payment_webhook(request: WebhookRequest, db: Session = Depends(get_db)):
    try:
        app = db.query(Appointment).filter(Appointment.id == request.appointment_id).first()
        if app:
            app.is_paid = True
            db.commit()
            return {"status": "success", "message": f"Appointment {app.id} marked as paid."}
        raise HTTPException(status_code=404, detail="Appointment not found")
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
