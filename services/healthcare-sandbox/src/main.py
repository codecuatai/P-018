import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="X-One Healthcare Sandbox Mock", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

MOCK_DEPARTMENTS = [
    {"id": 1, "name": "Khoa Nội Tim mạch", "description": "Khám và điều trị bệnh về Tim, huyết áp, mạch máu"},
    {"id": 2, "name": "Khoa Nội Thần kinh", "description": "Khám não, tủy sống, dây thần kinh, đột quỵ"},
    {"id": 3, "name": "Khoa Nội Cơ - Xương - Khớp", "description": "Khám khớp, gân, thoái hóa, gout"},
    {"id": 4, "name": "Khoa Nội Tiêu hóa - Gan mật", "description": "Dạ dày, đại tràng, gan, mật"},
    {"id": 5, "name": "Khoa Nội Hô hấp", "description": "Phổi, phế quản, hen suyễn"},
    {"id": 6, "name": "Khoa Nội Tiết", "description": "Tiểu đường, tuyến giáp, rối loạn chuyển hóa"},
    {"id": 7, "name": "Khoa Nội Thận - Tiết niệu & Lọc máu", "description": "Khám thận, lọc máu"},
    {"id": 8, "name": "Khoa Truyền nhiễm / Bệnh nhiệt đới", "description": "Điều trị bệnh lây nhiễm"},
    {"id": 9, "name": "Khoa Ngoại Tổng hợp", "description": "Mổ tiêu hóa, gan mật, ruột thừa"},
    {"id": 10, "name": "Khoa Ngoại Chấn thương Chỉnh hình", "description": "Mổ gãy xương, đứt dây chằng, thay khớp"},
    {"id": 11, "name": "Khoa Ngoại Thần kinh - Cột sống", "description": "Mổ thoát vị đĩa đệm, chấn thương sọ não"},
    {"id": 12, "name": "Khoa Ngoại Tiết niệu", "description": "Sỏi thận, mổ tuyến tiền liệt"},
    {"id": 13, "name": "Khoa Ngoại Lồng ngực - Tim mạch", "description": "Phẫu thuật tim, lồng ngực"},
    {"id": 14, "name": "Khoa Nhi", "description": "Dành cho trẻ em"},
    {"id": 15, "name": "Khoa Phụ sản", "description": "Sản khoa và Phụ khoa"},
    {"id": 16, "name": "Khoa Mắt", "description": "Nhãn khoa"},
    {"id": 17, "name": "Khoa Tai - Mũi - Họng", "description": "Tai, Mũi, Họng"},
    {"id": 18, "name": "Khoa Răng - Hàm - Mặt", "description": "Khám răng miệng"},
    {"id": 19, "name": "Khoa Da liễu", "description": "Bệnh ngoài da"},
    {"id": 20, "name": "Khoa Khám bệnh", "description": "Tiếp nhận, phân loại và khám ban đầu"}
]

MOCK_DOCTORS = [
    {"id": 1, "name": "BS. Nguyễn Văn An", "department": "Khoa Nội Thần kinh", "price": 500000, "description": "Chuyên gia thần kinh", "available_slots": [{"id": 1001, "start_time": "2026-10-10 08:00"}, {"id": 1002, "start_time": "2026-10-10 08:30"}]},
    {"id": 2, "name": "BS. Trần Thị Bình", "department": "Khoa Nội Tim mạch", "price": 550000, "description": "Kinh nghiệm 15 năm", "available_slots": [{"id": 1003, "start_time": "2026-10-10 08:00"}]},
    {"id": 3, "name": "BS. Lê Hoàng Cường", "department": "Khoa Nội Tiêu hóa - Gan mật", "price": 450000, "description": "Chuyên điều trị dạ dày", "available_slots": [{"id": 1004, "start_time": "2026-10-10 09:00"}]},
    {"id": 4, "name": "BS. Phạm Thị Dung", "department": "Khoa Nội Thần kinh", "price": 500000, "description": "Suy nhược thần kinh", "available_slots": [{"id": 1005, "start_time": "2026-10-10 09:30"}]},
    {"id": 5, "name": "BS. Đặng Văn Hùng", "department": "Khoa Nội Cơ - Xương - Khớp", "price": 400000, "description": "Chuyên chữa thoái hóa khớp", "available_slots": [{"id": 1006, "start_time": "2026-10-10 10:00"}]},
    {"id": 6, "name": "BS. Trịnh Quang Tuấn", "department": "Khoa Ngoại Chấn thương Chỉnh hình", "price": 600000, "description": "Phẫu thuật thay khớp, nối gân", "available_slots": [{"id": 1007, "start_time": "2026-10-10 10:30"}]},
    {"id": 7, "name": "BS. Lê Đình Nam", "department": "Khoa Khám bệnh", "price": 150000, "description": "Khám tổng quát, phân loại", "available_slots": [{"id": 1008, "start_time": "2026-10-10 14:00"}]},
    {"id": 8, "name": "BS. Bùi Thị Ngọc", "department": "Khoa Mắt", "price": 300000, "description": "Đo thị lực, cắt kính, mổ cận", "available_slots": [{"id": 1009, "start_time": "2026-10-10 14:30"}]},
    {"id": 9, "name": "BS. Hoàng Thanh Mai", "department": "Khoa Da liễu", "price": 250000, "description": "Trị mụn, laser da liễu", "available_slots": [{"id": 1010, "start_time": "2026-10-10 15:00"}]},
    {"id": 10, "name": "BS. Vũ Thị Phương", "department": "Khoa Phụ sản", "price": 350000, "description": "Khám thai, siêu âm thai", "available_slots": [{"id": 1011, "start_time": "2026-10-10 15:30"}]},
    {"id": 11, "name": "BS. Đỗ Trọng Tài", "department": "Khoa Nhi", "price": 200000, "description": "Khám nhi đồng", "available_slots": [{"id": 1012, "start_time": "2026-10-11 08:00"}]},
    {"id": 12, "name": "BS. Phạm Trung Kiên", "department": "Khoa Nội Hô hấp", "price": 300000, "description": "Hen suyễn, viêm phế quản", "available_slots": [{"id": 1013, "start_time": "2026-10-11 08:30"}]},
    {"id": 13, "name": "BS. Lê Thu Trà", "department": "Khoa Nội Tiết", "price": 350000, "description": "Tiểu đường, tuyến giáp", "available_slots": [{"id": 1014, "start_time": "2026-10-11 09:00"}]},
    {"id": 14, "name": "BS. Phan Văn Đạt", "department": "Khoa Nội Thận - Tiết niệu & Lọc máu", "price": 400000, "description": "Khám thận, chạy thận", "available_slots": [{"id": 1015, "start_time": "2026-10-11 09:30"}]},
    {"id": 15, "name": "BS. Ngô Tuấn Hải", "department": "Khoa Truyền nhiễm / Bệnh nhiệt đới", "price": 250000, "description": "Sốt xuất huyết, viêm gan", "available_slots": [{"id": 1016, "start_time": "2026-10-11 10:00"}]},
    {"id": 16, "name": "BS. Trần Đình Tùng", "department": "Khoa Ngoại Tổng hợp", "price": 500000, "description": "Mổ ruột thừa, sỏi mật", "available_slots": [{"id": 1017, "start_time": "2026-10-11 10:30"}]},
    {"id": 17, "name": "BS. Nguyễn Quốc Bảo", "department": "Khoa Ngoại Thần kinh - Cột sống", "price": 700000, "description": "Mổ thoát vị đĩa đệm", "available_slots": [{"id": 1018, "start_time": "2026-10-11 14:00"}]},
    {"id": 18, "name": "BS. Trương Viết Phúc", "department": "Khoa Ngoại Tiết niệu", "price": 450000, "description": "Mổ sỏi thận", "available_slots": [{"id": 1019, "start_time": "2026-10-11 14:30"}]},
    {"id": 19, "name": "BS. Lý Quang Huy", "department": "Khoa Ngoại Lồng ngực - Tim mạch", "price": 800000, "description": "Phẫu thuật tim, van tim", "available_slots": [{"id": 1020, "start_time": "2026-10-11 15:00"}]},
    {"id": 20, "name": "BS. Cao Thị Thu", "department": "Khoa Tai - Mũi - Họng", "price": 250000, "description": "Khám viêm xoang, amidan", "available_slots": [{"id": 1021, "start_time": "2026-10-11 15:30"}]},
    {"id": 21, "name": "BS. Đinh Công Trí", "department": "Khoa Răng - Hàm - Mặt", "price": 200000, "description": "Nhổ răng khôn, niềng răng", "available_slots": [{"id": 1022, "start_time": "2026-10-11 16:00"}]}
]

# Tự động sinh ra 4 khung giờ trống cho mỗi bác sĩ để dữ liệu Sandbox phong phú hơn
try:
    base_time = datetime.strptime("2026-10-10 08:00", "%Y-%m-%d %H:%M")
    for i, doc in enumerate(MOCK_DOCTORS):
        doc["available_slots"] = []
        for j in range(4):
            slot_id = 1000 + (i * 4) + j + 1
            st = base_time + timedelta(hours=j, minutes=(i % 2) * 30)
            doc["available_slots"].append({"id": slot_id, "start_time": st.strftime("%Y-%m-%d %H:%M")})
except Exception:
    pass

def make_response(data: Any):
    return {
        "data": data,
        "meta": {
            "request_id": f"cor_{uuid.uuid4().hex[:12]}",
            "timestamp": datetime.now(UTC).isoformat()
        }
    }

@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    # RFC-7807 inspired JSON
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code, content={
        "type": "errors/internal",
        "title": "Error",
        "status": exc.status_code,
        "code": "error",
        "detail": str(exc.detail),
        "retryable": False,
        "request_id": f"cor_{uuid.uuid4().hex[:12]}"
    })

def make_error(status_code: int, type_uri: str, title: str, detail: str, retryable: bool = False):
    raise HTTPException(status_code=status_code, detail={
        "type": type_uri,
        "title": title,
        "status": status_code,
        "code": type_uri.split("/")[-1],
        "detail": detail,
        "retryable": retryable,
        "request_id": f"cor_{uuid.uuid4().hex[:12]}"
    })

idempotency_store = {}

def check_idempotency(key: str):
    if key in idempotency_store:
        return idempotency_store[key]
    return None

def store_idempotency(key: str, response: dict):
    if key:
        idempotency_store[key] = response

class HoldSlotRequest(BaseModel):
    slot_id: int
    patient_id: int
    symptoms: str

class WebhookRequest(BaseModel):
    appointment_id: int

@app.get("/api/v1/departments")
def get_departments():
    return make_response(MOCK_DEPARTMENTS)

@app.get("/api/v1/doctors")
def get_doctors(department: str):
    filtered_doctors = [doc for doc in MOCK_DOCTORS if doc.get("department") == department]
    return make_response(filtered_doctors)

@app.post("/api/v1/slots/hold")
def hold_slot(req: HoldSlotRequest, idempotency_key: str | None = Header(None)):
    if idempotency_key:
        cached = check_idempotency(idempotency_key)
        if cached:
            return cached

    doc_name = "BS. Ẩn Danh (Sandbox)"
    start_time = "2026-10-10 08:00"

    for doc in MOCK_DOCTORS:
        for slot in doc["available_slots"]:
            if slot["id"] == req.slot_id:
                doc_name = doc["name"]
                start_time = slot["start_time"]
                break

    res = make_response({
        "appointment_id": 9999,
        "doctor_name": doc_name,
        "start_time": start_time
    })

    if idempotency_key:
        store_idempotency(idempotency_key, res)
    return res

@app.post("/api/v1/appointments/{appointment_id}/confirm")
def confirm_booking(appointment_id: int, idempotency_key: str | None = Header(None)):
    if idempotency_key:
        cached = check_idempotency(idempotency_key)
        if cached:
            return cached

    res = make_response({"status": "success", "message": "Booking confirmed via Sandbox Mock"})
    if idempotency_key:
        store_idempotency(idempotency_key, res)
    return res

@app.post("/api/v1/appointments/{appointment_id}/cancel")
def cancel_booking(appointment_id: int, idempotency_key: str | None = Header(None)):
    if idempotency_key:
        cached = check_idempotency(idempotency_key)
        if cached:
            return cached

    res = make_response({"status": "success", "message": "Booking cancelled via Sandbox Mock"})
    if idempotency_key:
        store_idempotency(idempotency_key, res)
    return res

@app.post("/api/v1/payment/webhook")
def payment_webhook(req: WebhookRequest):
    return make_response({"status": "success", "message": "Webhook received in Sandbox"})
