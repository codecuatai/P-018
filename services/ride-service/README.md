# Dịch Vụ Di Chuyển (Ride Service)

Dịch vụ Ride chịu trách nhiệm mô phỏng và quản lý vòng đời chuyến đi: tính toán báo giá (quote), giữ chỗ xe (prepare booking), xác nhận đặt xe (confirm booking), phân công tài xế mô phỏng, phát sự kiện theo dõi hành trình (tracking) theo thời gian thực và quản lý hủy chuyến.

## 1. Trách Nhiệm & Ranh Giới Nghiệp Vụ

- **Sở hữu độc quyền**:
  - Biểu phí cước di chuyển theo từng loại phương tiện (`4_SEATS`, `7_SEATS`, `MOTORBIKE`).
  - Chính sách giới hạn số lượng hành khách theo loại xe.
  - Quản lý vòng đời trạng thái chuyến đi (`AWAITING_CONFIRMATION` → `SEARCHING_DRIVER` → `DRIVER_ASSIGNED` → `DRIVER_TO_PICKUP` → `DRIVER_ARRIVED` → `IN_PROGRESS` → `COMPLETED` hoặc `CANCELLED`, `NO_DRIVER`).
  - Snapshot báo giá bất biến gắn với đơn đặt xe.
  - Mô phỏng di chuyển tài xế và tính toán tọa độ tracking.
- **Không sở hữu**:
  - Giao diện người dùng hoặc xác thực tài khoản (thuộc Gateway/Core).
  - Tích hợp cổng thanh toán bên ngoài (thuộc Gateway Sandbox).

## 2. API & Ranh Giới Bảo Mật

Toàn bộ các tuyến đường đều nằm dưới tiền tố `/v1` và là API nội bộ:
- Bắt buộc header `X-Internal-Service-Token`.
- Các endpoint gắn với người dùng yêu cầu header `X-Actor-Id`.
- Mọi thao tác ghi (`POST /v1/quotes`, `POST /v1/bookings:prepare`, `POST /v1/bookings/{id}:confirm`, `POST /v1/bookings/{id}:cancel`) bắt buộc phải có header `Idempotency-Key`.

### Các Tuyến Đường Chính:
- `POST /v1/quotes`: Tạo báo giá chuyến đi có thời hạn, hỗ trợ tối đa 2 điểm dừng trung gian (stopovers).
- `GET /v1/quotes/{id}`: Tra cứu thông tin báo giá.
- `POST /v1/bookings:prepare`: Bước 1 trong quy trình xác nhận 2 bước, chuyển trạng thái sang `AWAITING_CONFIRMATION`.
- `POST /v1/bookings/{id}:confirm`: Bước 2 - xác nhận đặt chuyến chính thức sau khi người dùng đồng ý thanh toán.
- `GET /v1/bookings/{id}`: Xem chi tiết chuyến xe theo actor.
- `GET /v1/bookings/{id}/tracking`: Tra cứu sự kiện và tọa độ di chuyển mô phỏng của tài xế.
- `POST /v1/bookings/{id}:cancel`: Hủy chuyến xe kèm lý do và bằng chứng hủy.

## 3. Quản Lý Cơ Sở Dữ Liệu & Migration

Dịch vụ sở hữu cơ sở dữ liệu `xone_ride` trên PostgreSQL và sử dụng Alembic để quản lý schema:
- Áp dụng migration: `alembic upgrade head`
- Revision `20260827_0007_quote_snapshot`: Bổ sung snapshot JSON báo giá bất biến vào bảng `ride_bookings`, bảo toàn biểu phí lịch sử ngay cả khi cước trực tiếp thay đổi.

## 4. Chạy Kiểm Thử Cục Bộ

```bash
pytest services/ride-service/tests -q
```
