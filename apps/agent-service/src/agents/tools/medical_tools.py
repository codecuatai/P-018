import os
import json
import uuid
import httpx
from typing import Optional
from langchain_core.tools import tool
from src.config import get_settings

settings = get_settings()
HEALTHCARE_SERVICE_URL = "http://healthcare-sandbox:8109" if settings.app_env == "docker" else "http://localhost:8109"
HEADERS = {
    "X-Internal-Token": settings.internal_service_token
}

# ==========================================
# CÁC CÔNG CỤ CHO AI AGENT (TOOLS) - GỌI HTTP API
# ==========================================

@tool
def analyze_symptoms(symptoms: str) -> str:
    """Phân tích triệu chứng và gợi ý các chuyên khoa phù hợp.
    
    Args:
        symptoms: Mô tả triệu chứng của bệnh nhân (VD: "đau bụng", "đau đầu").
    """
    try:
        response = httpx.get(f"{HEALTHCARE_SERVICE_URL}/api/v1/departments", timeout=10.0)
        response.raise_for_status()
        res_json = response.json()
        depts = res_json.get("data", res_json) if isinstance(res_json, dict) and "data" in res_json else res_json
        
        result = "Dưới đây là danh sách tất cả các chuyên khoa của bệnh viện. Dựa vào triệu chứng của người bệnh, hãy tự suy luận và chọn ra chuyên khoa phù hợp nhất:\n"
        for d in depts:
            result += f"- {d.get('name')} (ID: {d.get('id')}): {d.get('description')}\n"
        return result
    except Exception as e:
        return f"Lỗi khi lấy danh sách chuyên khoa từ Domain Service: {str(e)}"


@tool
def get_available_slots(department_name: str) -> str:
    """Tìm danh sách bác sĩ và các khung giờ rảnh (AVAILABLE) của họ theo chuyên khoa.
    
    Args:
        department_name: Tên chuyên khoa cần tìm (ví dụ: "Thần kinh", "Tiêu hóa").
    """
    try:
        response = httpx.get(f"{HEALTHCARE_SERVICE_URL}/api/v1/doctors", params={"department": department_name}, timeout=10.0)
        
        if response.status_code == 404:
            return response.json().get("detail", f"Không tìm thấy chuyên khoa nào tên '{department_name}'.")
            
        response.raise_for_status()
        res_json = response.json()
        doctors = res_json.get("data", res_json) if isinstance(res_json, dict) and "data" in res_json else res_json
        
        if not doctors:
            return f"Hiện tại không có bác sĩ nào thuộc chuyên khoa '{department_name}'."
        
        result_text = f"Danh sách bác sĩ chuyên khoa {department_name} và lịch rảnh:\n"
        for doc in doctors:
            slots = doc.get("available_slots", [])
            if slots:
                result_text += f"- Bác sĩ: {doc.get('name')} (ID: {doc.get('id')}) | Phí: {doc.get('price')} VND | Chuyên môn: {doc.get('description')}\n"
                result_text += "  Các giờ rảnh:\n"
                for s in slots:
                    result_text += f"    + Slot ID {s.get('id')}: {s.get('start_time')}\n"
                result_text += "\n"
        
        if "Bác sĩ" not in result_text:
            return f"Hiện tại các bác sĩ khoa {department_name} đều đã kín lịch."
            
        return result_text
    except Exception as e:
        return f"Lỗi khi tra cứu lịch rảnh từ Domain Service: {str(e)}"


@tool
def hold_slot(slot_id: int, symptoms: str) -> str:
    """Thực hiện giữ chỗ (Hold) một lịch khám và tạo Appointment (trạng thái DRAFT).
    
    Args:
        slot_id: ID của khung giờ (TimeSlot ID).
        symptoms: Triệu chứng.
    """
    try:
        idempotency_key = str(uuid.uuid4())
        payload = {
            "slot_id": slot_id,
            "patient_id": 1, # Sử dụng patient_id=1 làm demo thay vì hỏi tên/sđt
            "symptoms": symptoms
        }
        headers = HEADERS.copy()
        headers["Idempotency-Key"] = idempotency_key
        
        response = httpx.post(f"{HEALTHCARE_SERVICE_URL}/api/v1/slots/hold", json=payload, headers=headers, timeout=10.0)
        
        if response.status_code != 200:
            return f"Lỗi: {response.json().get('detail', 'Giữ chỗ thất bại.')}"
            
        res_json = response.json()
        data = res_json.get("data", res_json) if isinstance(res_json, dict) and "data" in res_json else res_json
        
        return (
            f"GIỮ CHỖ THÀNH CÔNG (Trạng thái: DRAFT).\n"
            f"Mã Lịch Hẹn (Appointment ID): {data.get('appointment_id')}\n"
            f"Bác sĩ: {data.get('doctor_name')}\n"
            f"Giờ khám: {data.get('start_time')}\n"
            f"Vui lòng yêu cầu bệnh nhân XÁC NHẬN để hoàn tất đặt lịch."
        )
    except Exception as e:
        return f"Đã xảy ra lỗi hệ thống khi giữ chỗ: {str(e)}"


@tool
def confirm_booking(appointment_id: int) -> str:
    """Xác nhận lịch hẹn. Chuyển trạng thái Appointment thành CONFIRMED và TimeSlot thành BOOKED.
    
    Args:
        appointment_id: Mã lịch hẹn cần xác nhận.
    """
    try:
        idempotency_key = str(uuid.uuid4())
        headers = HEADERS.copy()
        headers["Idempotency-Key"] = idempotency_key
        
        response = httpx.post(f"{HEALTHCARE_SERVICE_URL}/api/v1/appointments/{appointment_id}/confirm", headers=headers, timeout=10.0)
        
        if response.status_code != 200:
            return f"Lỗi từ hệ thống: {response.json().get('detail', 'Xác nhận lịch thất bại.')}"
            
        return f"XÁC NHẬN ĐẶT LỊCH THÀNH CÔNG! Lịch hẹn số {appointment_id} đã chuyển sang trạng thái BOOKED."
    except Exception as e:
        return f"Lỗi khi xác nhận lịch: {str(e)}"


@tool
def cancel_booking(appointment_id: int) -> str:
    """Hủy lịch hẹn khám. Chuyển trạng thái Appointment thành CANCELLED và nhả TimeSlot về AVAILABLE.
    
    Args:
        appointment_id: Mã lịch hẹn cần hủy.
    """
    try:
        idempotency_key = str(uuid.uuid4())
        headers = HEADERS.copy()
        headers["Idempotency-Key"] = idempotency_key
        
        response = httpx.post(f"{HEALTHCARE_SERVICE_URL}/api/v1/appointments/{appointment_id}/cancel", headers=headers, timeout=10.0)
        
        if response.status_code != 200:
            return f"Lỗi từ hệ thống: {response.json().get('detail', 'Hủy lịch thất bại.')}"
            
        return f"HỦY LỊCH THÀNH CÔNG! Lịch hẹn số {appointment_id} đã được hủy, khung giờ đã được mở lại cho bệnh nhân khác."
    except Exception as e:
        return f"Lỗi khi hủy lịch: {str(e)}"


# Danh sách tools để export cho Agent sử dụng
medical_tools_list = [
    analyze_symptoms,
    get_available_slots,
    hold_slot,
    confirm_booking,
    cancel_booking
]
