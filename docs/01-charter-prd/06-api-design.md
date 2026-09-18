# Tool Specifications & API Contracts

> **X-ONE ASSISTANT | DANH SÁCH API & THIẾT KẾ TOOL CALLING DÀNH CHO AGENT**\
> **Chuẩn hóa Pydantic Schema** | **Transaction Safety** | **Idempotency Protection**\

---

## 1. Chuẩn Bắt Buộc Cho Tất Cả Các Tool (Tool Mandates)

Mọi Tool được đăng ký vào hệ thống LangGraph Tool Registry phải tuân thủ nghiêm ngặt 7 nguyên tắc:
1. **Pydantic Schema Input/Output:** Mọi tham số đầu vào và kết quả đầu ra phải được định nghĩa bằng Pydantic model rõ ràng.
2. **Phân cấp quyền hạn (Permission Levels):**
   - `search`: Quyền tìm kiếm công khai (không cần xác nhận).
   - `transaction`: Quyền thực thi giao dịch (bắt buộc Confirmation Token từ người dùng).
   - `privileged`: Quyền quản trị / vận hành hệ thống (dành cho Operator/Admin).
3. **Chính sách Timeout & Retry:** Timeout mặc định 10s; thử lại tối đa 2 lần đối với lỗi mạng (Network error).
4. **Mã lỗi chuẩn hóa (Stable Error Codes):** Trả về mã lỗi nhất quán (`NOT_FOUND`, `UNAVAILABLE`, `INVALID_TOKEN`, `INSUFFICIENT_FUNDS`, `EXPIRED_TOKEN`).
5. **Idempotency Key:** Mọi Tool tạo mới hoặc sửa đổi dữ liệu bắt buộc truyền Idempotency Key được tạo bằng công thức:
   $$\text{Key} = \text{SHA256}(\text{user\_id} + \text{action\_type} + \text{resource\_id} + \text{confirmation\_id} + \text{payload\_hash})$$
6. **Audit Logging & Trace ID:** Ghi vết mọi lượt gọi Tool đính kèm Trace ID xuyên suốt hệ thống.
7. **Bảo vệ chống Hallucination:** Tool không chấp nhận các dữ liệu quan trọng do LLM tự bịa ra nếu đã có `option_id` hoặc `resource_id` hợp lệ do Backend trả về trước đó.

---

### 1.1 Provider Adapter Strategy

Các Tool nội bộ không được gọi trực tiếp provider bên thứ ba từ LangGraph. Mỗi domain phải đi qua một lớp Provider Adapter để có thể chuyển đổi linh hoạt giữa mock, sandbox và partner API thật.

```text
LangGraph Agent -> Internal Tool -> Provider Adapter -> External Sandbox/Partner API
```

Provider Adapter chịu trách nhiệm:

- Chuẩn hóa request/response của provider thành schema nội bộ.
- Map `provider_status` sang `internal_status`.
- Lưu `provider_booking_id`, `provider_payment_id` hoặc `provider_reservation_id` như metadata của Order/Order Item.
- Không tự quyết định policy giao dịch. Confirmation Token, Idempotency Key, RBAC, audit log và retry policy vẫn do Backend kiểm soát.
- Cho phép cấu hình provider bằng biến môi trường, ví dụ `RIDE_PROVIDER=uber_guest_sandbox`, `MEDICAL_PROVIDER=ms_bookings`, `RESTAURANT_PROVIDER=opentable_sandbox`.

Chi tiết lựa chọn sandbox/provider cho từng domain được mô tả trong [08-service-api-integration-guide.md](08-service-api-integration-guide.md).

---

## 2. Danh Sách Tool Specifications Theo Domain

### 2.1 Ride Booking Domain Tools

```python
class SearchRidesInput(BaseModel):
    pickup_location: str = Field(description="Địa điểm đón khách")
    destination_location: str = Field(description="Địa điểm đến")
    pickup_time: Optional[datetime] = Field(default=None, description="Thời gian đón")
    vehicle_type: Optional[str] = Field(default=None, description="Loại xe: bike, economy_4s, premium_4s, 7s")

class BookRideInput(BaseModel):
    confirmation_token: str = Field(description="Token xác nhận do Backend cấp")
    idempotency_key: str = Field(description="SHA256 Idempotency Key")
```

- **`search_rides(pickup, destination, pickup_time, vehicle_type)`**: Tìm kiếm chuyến xe khả dụng và ước tính cước phí/thời gian di chuyển.
- **`preview_ride(ride_option_id)`**: Lấy thông tin chi tiết lựa chọn xe trước khi tạo confirmation card.
- **`book_ride(confirmation_token, idempotency_key)`**: Thực hiện tạo đơn đặt xe (yêu cầu Confirmation Token).
- **`get_ride_status(booking_id)`**: Truy vấn trạng thái tài xế và hành trình chuyến xe theo thời gian thực.
- **`cancel_ride(booking_id, confirmation_token)`**: Hủy chuyến xe đã đặt và tính toán phí hủy (nếu có).
- **`rate_ride(booking_id, rating_stars, feedback_comment)`**: Gửi đánh giá sao và nhận xét cho chuyến đi.

---

### 2.2 Medical Appointment Domain Tools

```python
class SearchFacilitiesInput(BaseModel):
    location: str = Field(description="Khu vực hoặc địa chỉ cần tìm phòng khám/bệnh viện")
    specialty: Optional[str] = Field(default=None, description="Chuyên khoa khám (ví dụ: da liễu, nhi, mắt)")

class BookAppointmentInput(BaseModel):
    confirmation_token: str = Field(description="Token xác nhận hợp lệ")
    idempotency_key: str = Field(description="SHA256 Idempotency Key")
```

- **`search_facilities(location, specialty)`**: Tìm kiếm bệnh viện / phòng khám theo khu vực và khoảng cách.
- **`search_specialties(facility_id)`**: Danh sách chuyên khoa thuộc bệnh viện/phòng khám.
- **`search_doctors(facility_id, specialty_id)`**: Danh sách bác sĩ đang công tác kèm theo giá khám.
- **`search_slots(facility_id, doctor_id, date)`**: Lấy danh sách các khung giờ khám còn trống trong ngày.
- **`preview_appointment(slot_id, doctor_id)`**: Lấy chi tiết thông tin lịch khám trước khi xác nhận.
- **`book_appointment(confirmation_token, idempotency_key)`**: Đặt lịch khám chính thức (bắt buộc xác nhận).
- **`reschedule_appointment(appointment_id, new_slot_id, confirmation_token)`**: Thay đổi sang khung giờ khám mới.
- **`cancel_appointment(appointment_id, confirmation_token)`**: Hủy lịch khám bệnh đã đặt.
- **`get_appointment_status(appointment_id)`**: Kiểm tra trạng thái xác nhận của lịch khám.

---

### 2.3 Restaurant Booking Domain Tools

- **`search_restaurants(location, cuisine_type, budget_range)`**: Tìm nhà hàng theo loại món, ngân sách và đánh giá.
- **`check_availability(restaurant_id, party_size, booking_time)`**: Kiểm tra số lượng bàn trống theo thời gian và số khách.
- **`preview_booking(restaurant_id, party_size, booking_time, special_requests)`**: Xem thông tin chi tiết bàn đặt.
- **`book_restaurant(confirmation_token, idempotency_key)`**: Tiến hành đặt bàn nhà hàng.
- **`update_restaurant_booking(booking_id, party_size, booking_time)`**: Đổi số người hoặc đổi giờ đặt bàn.
- **`cancel_restaurant_booking(booking_id, confirmation_token)`**: Hủy đặt bàn nhà hàng.

---

### 2.4 Payment Sandbox Domain Tools

- **`list_bills(user_id, bill_type)`**: Lấy danh sách hóa đơn điện, nước, internet giả lập cần thanh toán.
- **`preview_payment(bill_id)`**: Hiển thị xem trước thông tin hóa đơn và số tiền cần gạch nợ.
- **`create_payment_intent(bill_id, amount)`**: Khởi tạo Intent thanh toán sandbox.
- **`confirm_payment(payment_intent_id, confirmation_token, idempotency_key)`**: Thực hiện gạch nợ thanh toán sandbox.
- **`get_payment_status(payment_id)`**: Truy vấn trạng thái giao dịch thanh toán.
- **`refund_payment(payment_id, reason, confirmation_token)`**: Thực hiện hoàn tiền sandbox theo chính sách.
- **`get_receipt(payment_id)`**: Xuất biên nhận giao dịch thanh toán điện tử.

---

### 2.5 User Memory Domain Tools

- **`get_preferences(user_id)`**: Lấy danh sách sở thích và địa chỉ quen thuộc của người dùng.
- **`suggest_memory(user_id, memory_type, memory_value)`**: Agent gợi ý lưu một địa chỉ/sở thích mới vào memory.
- **`save_memory(user_id, memory_data, consent_token)`**: Lưu memory chính thức sau khi người dùng đồng ý.
- **`update_memory(memory_id, updated_value)`**: Sửa đổi dữ liệu memory đã lưu.
- **`delete_memory(memory_id)`**: Xóa bỏ một dòng dữ liệu memory khỏi hệ thống.
- **`list_memories(user_id)`**: Hiển thị toàn bộ lịch sử memory kèm theo consent status.

---

## 3. Cấu Trúc Confirmation Token (Confirmation Token Specification)

Confirmation Token là cơ chế an toàn bảo vệ mọi giao dịch nhạy cảm. Token được phát hành bởi Backend với cấu trúc như sau:

```json
{
  "token_id": "tok_982347923847293",
  "user_id": "usr_88321",
  "action_type": "BOOK_RIDE",
  "payload_hash": "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
  "issued_at": "2026-08-02T21:30:00Z",
  "expires_at": "2026-08-02T21:35:00Z",
  "nonce": "nc_77182391",
  "signature": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

- **Thời gian sống (TTL):** Tối đa 5 phút. Token sẽ lập tức mất hiệu lực sau khi đã sử dụng 1 lần (Single-use Nonce).
- **Kiểm tra Payload Mismatch:** Khi gửi xác nhận, Backend thực hiện tính toán lại hash của payload hiện tại. Nếu hash không trùng khớp với `payload_hash` trong token (do người dùng chỉnh sửa thông số lén lút), giao dịch sẽ lập tức bị từ chối với mã lỗi `PAYLOAD_MISMATCH`.
