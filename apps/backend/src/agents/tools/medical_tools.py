import json
from datetime import datetime
from typing import Optional, List, Dict
from langchain_core.tools import tool
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from src.database import SessionLocal
from src.models.medical import Department, Doctor, TimeSlot, Appointment, AuditLog, SlotStatus, AppointmentStatus

# ==========================================
# CÁC CÔNG CỤ CHO AI AGENT (TOOLS) - GIAO TIẾP VỚI DB
# ==========================================

@tool
def analyze_symptoms(symptoms: str) -> str:
    """Phân tích triệu chứng và gợi ý các chuyên khoa phù hợp từ Cơ sở dữ liệu.
    
    Args:
        symptoms: Mô tả triệu chứng của bệnh nhân (VD: "đau bụng", "đau đầu").
    """
    db: Session = SessionLocal()
    try:
        # LLM tự phân tích ngôn ngữ rất tốt, ta chỉ cần trả về toàn bộ danh sách Khoa
        # để LLM tự đối chiếu triệu chứng với mô tả Khoa và chọn ra khoa phù hợp nhất.
        depts = db.query(Department).all()
        result = "Dưới đây là danh sách tất cả các chuyên khoa của bệnh viện. Dựa vào triệu chứng của người bệnh, hãy tự suy luận và chọn ra chuyên khoa phù hợp nhất:\n"
        for d in depts:
            result += f"- {d.name} (ID: {d.id}): {d.description}\n"
        return result
    finally:
        db.close()


@tool
def get_available_slots(department_name: str) -> str:
    """Tìm danh sách bác sĩ và các khung giờ rảnh (AVAILABLE) của họ theo chuyên khoa.
    
    Args:
        department_name: Tên chuyên khoa cần tìm (ví dụ: "Thần kinh", "Tiêu hóa").
    """
    db: Session = SessionLocal()
    try:
        dept = db.query(Department).filter(Department.name.ilike(f"%{department_name}%")).first()
        if not dept:
            return f"Không tìm thấy chuyên khoa nào tên '{department_name}'."
        
        doctors = db.query(Doctor).filter(Doctor.department_id == dept.id).all()
        if not doctors:
            return f"Hiện tại không có bác sĩ nào thuộc chuyên khoa '{department_name}'."
        
        response = f"Danh sách bác sĩ chuyên khoa {dept.name} và lịch rảnh:\n"
        for doc in doctors:
            # Lấy các slot còn AVAILABLE, >= hiện tại (giả lập là lấy tất cả AVAILABLE)
            slots = db.query(TimeSlot).filter(
                TimeSlot.doctor_id == doc.id,
                TimeSlot.status == SlotStatus.AVAILABLE
            ).order_by(TimeSlot.start_time).all()
            
            if slots:
                response += f"- Bác sĩ: {doc.name} (ID: {doc.id}) | Phí: {doc.price} VND | Chuyên môn: {doc.description}\n"
                response += "  Các giờ rảnh:\n"
                for s in slots:
                    time_str = s.start_time.strftime("%Y-%m-%d %H:%M")
                    response += f"    + Slot ID {s.id}: {time_str}\n"
                response += "\n"
        
        if "Bác sĩ" not in response:
            return f"Hiện tại các bác sĩ khoa {dept.name} đều đã kín lịch."
            
        return response
    finally:
        db.close()


@tool
def hold_slot(slot_id: int, patient_name: str, patient_phone: str, symptoms: str) -> str:
    """Thực hiện giữ chỗ (Hold) một lịch khám và tạo Appointment (trạng thái DRAFT).
    Sử dụng Pessimistic Locking để tránh trùng lịch.
    
    Args:
        slot_id: ID của khung giờ (TimeSlot ID).
        patient_name: Tên bệnh nhân.
        patient_phone: Số điện thoại.
        symptoms: Triệu chứng.
    """
    db: Session = SessionLocal()
    try:
        # Bắt đầu transaction và khóa (Pessimistic Lock) dòng TimeSlot
        slot = db.query(TimeSlot).filter(TimeSlot.id == slot_id).with_for_update().first()
        
        if not slot:
            return f"Lỗi: Không tìm thấy Slot ID {slot_id}."
            
        if slot.status != SlotStatus.AVAILABLE:
            return f"Lỗi: Rất tiếc, khung giờ này đã được đặt hoặc đang giữ chỗ bởi người khác. Vui lòng chọn giờ khác."
            
        # Đổi trạng thái slot
        slot.status = SlotStatus.HOLDING
        
        # Tạo Appointment (DRAFT)
        appointment = Appointment(
            patient_name=patient_name,
            patient_phone=patient_phone,
            symptoms=symptoms,
            doctor_id=slot.doctor_id,
            slot_id=slot.id,
            status=AppointmentStatus.DRAFT
        )
        db.add(appointment)
        db.commit()
        db.refresh(appointment)
        
        return (
            f"GIỮ CHỖ THÀNH CÔNG (Trạng thái: DRAFT).\n"
            f"Mã Lịch Hẹn (Appointment ID): {appointment.id}\n"
            f"Bác sĩ: {slot.doctor.name}\n"
            f"Giờ khám: {slot.start_time.strftime('%Y-%m-%d %H:%M')}\n"
            f"Vui lòng yêu cầu bệnh nhân XÁC NHẬN để hoàn tất đặt lịch."
        )
    except Exception as e:
        db.rollback()
        return f"Đã xảy ra lỗi hệ thống khi giữ chỗ: {str(e)}"
    finally:
        db.close()


@tool
def confirm_booking(appointment_id: int) -> str:
    """Xác nhận lịch hẹn. Chuyển trạng thái Appointment thành CONFIRMED và TimeSlot thành BOOKED.
    Đồng thời ghi Audit Log.
    
    Args:
        appointment_id: Mã lịch hẹn cần xác nhận.
    """
    db: Session = SessionLocal()
    try:
        appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
        if not appointment:
            return f"Lỗi: Không tìm thấy Lịch hẹn số {appointment_id}."
            
        if appointment.status == AppointmentStatus.CONFIRMED:
            return "Lịch hẹn này đã được xác nhận từ trước."
            
        if not appointment.is_paid:
            return f"TỪ CHỐI CHỐT LỊCH: Lịch hẹn số {appointment_id} chưa được thanh toán trên hệ thống (is_paid=False). Hãy yêu cầu user thanh toán phí khám trước."
            
        slot = appointment.slot
        
        # Cập nhật trạng thái
        appointment.status = AppointmentStatus.CONFIRMED
        if slot:
            slot.status = SlotStatus.BOOKED
            
        # Ghi log kiểm toán
        audit_log = AuditLog(
            appointment_id=appointment.id,
            action="BOOKING_CONFIRMED",
            details=f"Booking confirmed for patient {appointment.patient_name}."
        )
        db.add(audit_log)
        db.commit()
        
        return f"XÁC NHẬN ĐẶT LỊCH THÀNH CÔNG! Lịch hẹn số {appointment_id} đã chuyển sang trạng thái BOOKED."
    except Exception as e:
        db.rollback()
        return f"Lỗi khi xác nhận lịch: {str(e)}"
    finally:
        db.close()


# Danh sách tools để export cho Agent sử dụng
medical_tools_list = [
    analyze_symptoms,
    get_available_slots,
    hold_slot,
    confirm_booking
]
