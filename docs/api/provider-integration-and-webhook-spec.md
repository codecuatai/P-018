# Đặc Tả Kỹ Thuật Tích Hợp API & Webhook Cho Đối Tác (Provider Integration & Webhook Specification)

Tài liệu này cung cấp đặc tả chuẩn tắc cho **4 dịch vụ độc lập bên ngoài** (Ride, Food, Healthcare, Restaurant) để kết nối 2 chiều với nền tảng **X-One**.

---

## 1. Mô Hình Kiến Trúc Giao Tiếp 2 Chiều (Architecture Overview)

Giao tiếp giữa hệ thống **X-One Gateway** và **4 Dịch Vụ Của Đối Tác** được thiết kế theo mô hình lai (Hybrid Event-Driven & REST API):

```
┌─────────────────────────┐                            ┌───────────────────────────────┐
│     Hệ Thống X-One      │                            │  4 Service Tự Tạo (External)  │
│      (API Gateway)      │                            │   (Ride, Food, Health, v.v.)  │
└────────────┬────────────┘                            └───────────────┬───────────────┘
             │                                                         │
             │   1. WEBHOOK: X-One gửi thông báo đơn/cuốc mới          │
             │   POST {webhook_url} (HMAC SHA-256 signature)           │
             │────────────────────────────────────────────────────────>│
             │   <── HTTP 200 OK (Đã tiếp nhận)                       │
             │                                                         │
             │   2. REST API: Service của bạn cập nhật trạng thái     │
             │   PATCH /api/v1/provider/services/operations/...        │
             │<────────────────────────────────────────────────────────│
             │   ──> HTTP 200 OK (Đã lưu PostgreSQL)                   │
             │                                                         │
             │   3. REST API: Đồng bộ thực đơn/dịch vụ/món ăn          │
             │   POST /api/v1/provider/services/items                  │
             │<────────────────────────────────────────────────────────│
             │   ──> HTTP 201 Created                                  │
```

- **Chiều 1 (X-One ➔ Service của bạn)**: Khi khách hàng trên app X-One đặt món, gọi xe, đặt lịch khám hoặc giữ bàn, Gateway sẽ bắn HTTP POST Webhook tới `webhook_url` do đối tác đăng ký.
- **Chiều 2 (Service của bạn ➔ X-One)**: Khi dịch vụ của bạn có thay đổi (tài xế đã đến điểm đón, nhà bếp đang nấu, bác sĩ khám xong, thêm món ăn mới), service của bạn gọi REST API về X-One Gateway kèm Bearer Token.

---

## 2. Thiết Lập Webhook URL Trên Cổng Đối Tác

1. Truy cập Cổng Đối Tác: [https://c3-app-018.io.vn/app/provider](https://c3-app-018.io.vn/app/provider)
2. Chọn tab **"Gắn & Quản lý Dịch vụ"**.
3. Tại ô **"Webhook URL tích hợp"**, nhập endpoint mà service của bạn đang lắng nghe (Ví dụ: `https://api.your-domain.com/v1/xone/webhook`).
4. Nhấn **"Lưu cập nhật hồ sơ"**.

---

## 3. Chiều 1: Đặc Tả Webhook Inbound (X-One ➔ Service Đối Tác)

### 3.1. Quy chuẩn HTTP Request Header
Khi X-One gửi webhook, HTTP Request luôn chứa các header sau:

| Header Name | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `Content-Type` | `string` | Luôn là `application/json` |
| `X-XOne-Event` | `string` | Tên sự kiện (VD: `food.order.created`, `ride.booking.created`) |
| `X-XOne-Delivery` | `string` | UUID duy nhất của lượt gửi webhook (dùng để chống trùng lặp) |
| `X-XOne-Timestamp` | `string` | Thời gian gửi theo chuẩn ISO 8601 (VD: `2026-09-08T17:00:00+07:00`) |
| `X-XOne-Signature` | `string` | Chữ ký HMAC SHA-256 xác thực nguồn gốc: `sha256=<hex_digest>` |

### 3.2. Cấu Trúc Payload Chung (Envelope)
```json
{
  "event": "food.order.created",
  "event_id": "evt_01J7K8M9NPQRSTUVW",
  "timestamp": "2026-09-08T17:00:00+07:00",
  "provider_id": "user-provider-01",
  "tenant_id": "partner-food-01",
  "data": {
    ...
  }
}
```

---

### 3.3. Chi tiết Payload Cho Từng Service

#### 1. Dịch vụ Vận chuyển (Ride Service)
- **Sự kiện `ride.booking.created`** (Có cuốc xe mới):
```json
{
  "event": "ride.booking.created",
  "event_id": "evt_ride_001",
  "timestamp": "2026-09-08T17:00:00+07:00",
  "data": {
    "booking_id": "ride_7d1fb77a77954e93a44e",
    "passenger_name": "Nguyễn Văn A",
    "passenger_phone": "0912345678",
    "pickup_address": "123 Lê Lợi, Phường Bến Nghé, Quận 1",
    "dropoff_address": "Landmark 81, Vinhomes Central Park, Bình Thạnh",
    "pickup_coordinates": { "latitude": 10.7769, "longitude": 106.7009 },
    "dropoff_coordinates": { "latitude": 10.7951, "longitude": 106.7218 },
    "vehicle_type": "CAR_4",
    "fare_amount": 90000,
    "currency": "VND",
    "status": "DRIVER_TO_PICKUP"
  }
}
```
- **Sự kiện `ride.booking.cancelled`** (Khách hủy chuyến):
```json
{
  "event": "ride.booking.cancelled",
  "event_id": "evt_ride_002",
  "timestamp": "2026-09-08T17:05:00+07:00",
  "data": {
    "booking_id": "ride_7d1fb77a77954e93a44e",
    "reason": "Khách hàng đổi lộ trình",
    "cancelled_by": "customer"
  }
}
```

---

#### 2. Dịch vụ Ẩm thực & Món ăn (Food Service)
- **Sự kiện `food.order.created`** (Đơn đặt món mới):
```json
{
  "event": "food.order.created",
  "event_id": "evt_food_001",
  "timestamp": "2026-09-08T17:00:00+07:00",
  "data": {
    "order_id": "ord_f7d1e2a826af",
    "customer_name": "Trần Thị B",
    "customer_phone": "0987654321",
    "delivery_address": "456 Nguyễn Huệ, Quận 1",
    "items": [
      {
        "item_id": "food-item-1",
        "name": "Phở Bò Tái Nạm Đặc Biệt",
        "quantity": 2,
        "price": 65000
      },
      {
        "item_id": "food-item-2",
        "name": "Quẩy giòn",
        "quantity": 1,
        "price": 10000
      }
    ],
    "subtotal": 140000,
    "delivery_fee": 15000,
    "total_amount": 155000,
    "currency": "VND",
    "note": "Cho nhiều ớt và không hành lá",
    "status": "RECEIVED"
  }
}
```

---

#### 3. Dịch vụ Y tế & Khám bệnh (Healthcare Service)
- **Sự kiện `healthcare.appointment.created`** (Lịch hẹn khám mới):
```json
{
  "event": "healthcare.appointment.created",
  "event_id": "evt_health_001",
  "timestamp": "2026-09-08T17:00:00+07:00",
  "data": {
    "appointment_id": "appt_12345",
    "patient_name": "Lê Văn C",
    "patient_phone": "0901234567",
    "doctor_name": "BS. CKI Trần Minh",
    "specialty": "Nội tổng quát",
    "type": "online",
    "scheduled_time": "2026-09-09T09:00:00+07:00",
    "fee": 300000,
    "currency": "VND",
    "status": "CONFIRMED"
  }
}
```

---

#### 4. Dịch vụ Đặt bàn Nhà hàng (Restaurant Service)
- **Sự kiện `restaurant.reservation.created`** (Lượt giữ bàn mới):
```json
{
  "event": "restaurant.reservation.created",
  "event_id": "evt_res_001",
  "timestamp": "2026-09-08T17:00:00+07:00",
  "data": {
    "reservation_id": "res_89012",
    "customer_name": "Hoàng Nam",
    "party_size": 4,
    "reserved_time": "2026-09-08T19:30:00+07:00",
    "special_requests": "Bàn cạnh cửa sổ lãng mạn",
    "status": "CONFIRMED"
  }
}
```

---

### 3.4. Phản Hồi Mong Đợi Từ Service Đối Tác (HTTP Response)
Khi nhận được webhook, service của bạn cần trả về:
- **HTTP Status Code**: `200 OK` (hoặc `202 Accepted`).
- **Body**:
```json
{
  "acknowledged": true,
  "received_at": "2026-09-08T17:00:01+07:00"
}
```
*(Nếu service của bạn trả về mã lỗi 5xx hoặc timeout quá 5 giây, X-One sẽ thực hiện cơ chế Exponential Backoff Retry).*

---

## 4. Chiều 2: Đặc Tả REST API (Service Đối Tác ➔ X-One Gateway)

Base URL:
- **Production**: `https://c3-app-018.io.vn` (hoặc `https://api.c3-app-018.io.vn`)

Tất cả các API này yêu cầu Header:
```http
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
```

---

### 4.1. Lấy Access Token (Đăng Nhập Đối Tác)
- **Endpoint**: `POST /api/v1/auth/login`
- **Request Body**:
```json
{
  "email": "provider@xone.local",
  "password": "Password123!"
}
```
- **Response**:
```json
{
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {
      "id": "u-provider-01",
      "email": "provider@xone.local",
      "role": "provider"
    }
  }
}
```

---

### 4.2. Cập Nhật Trạng Thái Điều Phối Thực Tế (Operations Status Transition)

#### A. Cập nhật chuyến xe (Ride)
- **Endpoint**: `PATCH /api/v1/provider/services/operations/rides/{bookingId}/status`
- **Các trạng thái hợp lệ**: `DRIVER_ARRIVED` ➔ `IN_PROGRESS` ➔ `ARRIVED_DESTINATION` ➔ `COMPLETED`
- **Request Body**:
```json
{
  "status": "IN_PROGRESS"
}
```
- **Response**: `200 OK`
```json
{
  "data": {
    "bookingId": "ride_7d1fb77a77954e93a44e",
    "status": "IN_PROGRESS",
    "updated": true
  }
}
```

#### B. Cập nhật đơn đặt món (Food)
- **Endpoint**: `PATCH /api/v1/provider/services/operations/orders/{orderId}/status`
- **Các trạng thái hợp lệ**: `PREPARING` ➔ `READY_FOR_PICKUP`
- **Request Body**:
```json
{
  "status": "READY_FOR_PICKUP"
}
```
- **Response**: `200 OK`
```json
{
  "data": {
    "orderId": "ord_f7d1e2a826af",
    "status": "READY_FOR_PICKUP",
    "updated": true
  }
}
```

#### C. Cập nhật lịch khám bệnh (Healthcare)
- **Endpoint**: `PATCH /api/v1/provider/services/operations/appointments/{appointmentId}/status`
- **Các trạng thái hợp lệ**: `IN_CONSULTATION` ➔ `COMPLETED`
- **Request Body**:
```json
{
  "status": "COMPLETED"
}
```
- **Response**: `200 OK`

---

### 4.3. Quản Lý Danh Mục Dịch Vụ / Món Ăn (Catalog Synchronization)

#### A. Thêm món ăn / dịch vụ mới vào hệ thống X-One
- **Endpoint**: `POST /api/v1/provider/services/items`
- **Request Body**:
```json
{
  "domain": "food",
  "name": "Bún Bò Huế Đặc Biệt",
  "price": 65000,
  "category": "Món nước",
  "description": "Bún bò thịt bắp hoa, giò heo, chả cua"
}
```
- **Response**: `201 Created`
```json
{
  "data": {
    "id": "item_1741427891234",
    "name": "Bún Bò Huế Đặc Biệt",
    "price": 65000,
    "currency": "VND",
    "category": "Món nước",
    "isAvailable": true
  }
}
```

#### B. Bật / Tắt trạng thái mở bán dịch vụ
- **Endpoint**: `PATCH /api/v1/provider/services/items/{itemId}/status`
- **Request Body**:
```json
{
  "is_available": false
}
```

#### C. Gỡ dịch vụ khỏi hệ thống
- **Endpoint**: `DELETE /api/v1/provider/services/items/{itemId}`
- **Response**: `200 OK`

---

## 5. Ví Dụ Triển Khai Thực Tế Cho Service Của Bạn

### 5.1. Ví dụ bằng Node.js (Express)
```javascript
const express = require("express");
const crypto = require("crypto");
const app = express();

app.use(express.json());

const WEBHOOK_SECRET = process.env.XONE_WEBHOOK_SECRET || "your-shared-secret";

// Middleware xác thực chữ ký HMAC SHA-256
function verifyXOneSignature(req, res, next) {
  const signature = req.headers["x-xone-signature"];
  if (!signature) {
    return res.status(401).json({ error: "Missing X-XOne-Signature header" });
  }

  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
  const digest = "sha256=" + hmac.update(JSON.stringify(req.body)).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
    return res.status(403).json({ error: "Invalid webhook signature" });
  }
  next();
}

// Endpoint nhận Webhook từ X-One
app.post("/v1/xone/webhook", (req, res) => {
  const { event, data } = req.body;
  console.log(`[X-One Event] ${event}:`, data);

  switch (event) {
    case "food.order.created":
      // Xử lý thông báo cho nhà bếp
      console.log(`Đơn món mới #${data.order_id}: ${data.items.length} món`);
      break;

    case "ride.booking.created":
      // Điều phối tài xế gần nhất
      console.log(`Cuốc xe mới #${data.booking_id}: đón tại ${data.pickup_address}`);
      break;

    case "healthcare.appointment.created":
      // Thông báo cho bác sĩ
      console.log(`Lịch khám mới #${data.appointment_id} cho bệnh nhân ${data.patient_name}`);
      break;
  }

  // Luôn trả về 200 OK để X-One xác nhận thành công
  return res.status(200).json({ acknowledged: true, received_at: new Date().toISOString() });
});

app.listen(3000, () => console.log("External Service listening on port 3000"));
```

---

### 5.2. Ví dụ bằng Python (FastAPI)
```python
from fastapi import FastAPI, Request, Header, HTTPException, status
import hmac
import hashlib
import json

app = FastAPI(title="External Partner Service")

WEBHOOK_SECRET = "your-shared-secret"

@app.post("/v1/xone/webhook")
async def handle_xone_webhook(
    request: Request,
    x_xone_event: str = Header(None),
    x_xone_signature: str = Header(None)
):
    body_bytes = await request.body()
    
    # Kiểm tra chữ ký bảo mật
    if x_xone_signature:
        expected_sig = "sha256=" + hmac.new(
            WEBHOOK_SECRET.encode(),
            body_bytes,
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(x_xone_signature, expected_sig):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")

    payload = json.loads(body_bytes.decode())
    event_type = payload.get("event")
    data = payload.get("data", {})

    print(f"Nhận sự kiện {event_type} từ X-One:", data)

    # Trả về phản hồi xác nhận cho X-One Gateway
    return {"acknowledged": True, "event": event_type}
```
