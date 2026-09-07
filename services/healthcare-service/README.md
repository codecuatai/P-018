# Dịch Vụ Y Tế (Healthcare Service)

Dịch vụ Healthcare quản lý danh mục cơ sở khám chữa bệnh, các chuyên khoa, danh sách bác sĩ, lịch khám theo khung giờ (time slots), hồ sơ y tế của bệnh nhân, quy trình giữ chỗ khám, ghi nhận thanh toán nội bộ, xác nhận lịch hẹn chính thức và hủy lịch hẹn.

## 1. Trách Nhiệm & Ranh Giới Nghiệp Vụ

- **Sở hữu độc quyền**:
  - Dữ liệu cơ sở y tế (`healthcare_facilities`), chuyên khoa (`departments`) và bác sĩ (`doctors`).
  - Lịch khám bệnh và khung giờ trống (`time_slots`).
  - Hồ sơ bệnh nhân (`patients`): tên, số điện thoại, nhóm máu, tiền sử bệnh án.
  - Bảng ánh xạ liên kết người dùng với bệnh nhân (`patient_user_links`).
  - Vòng đời lịch hẹn khám (`appointments`): `HELD` → `PAYMENT_PENDING` → `CONFIRMED` / `CANCELLED`.
  - Sổ cái kiểm tra tính idempotent của các giao dịch y tế.
- **Không sở hữu**:
  - Tài khoản người dùng và xác thực mật khẩu (thuộc Core).
  - Vận chuyển người dùng tới cơ sở y tế (thuộc Ride Service).
  - Cổng thanh toán tài chính bên ngoài (thuộc Gateway Sandbox).

## 2. API & Ranh Giới Bảo Mật

Toàn bộ các tuyến đường đều nằm dưới tiền tố `/api/v1` và là API nội bộ:
- Bắt buộc header `X-Internal-Service-Token`.
- Các endpoint thao tác theo người dùng yêu cầu header `X-Actor-Id`.
- Mọi thao tác ghi (`POST /api/v1/slots/hold`, `POST /api/v1/appointments/{id}/confirm`, `POST /api/v1/appointments/{id}/cancel`) bắt buộc phải có `Idempotency-Key`.

### Các Tuyến Đường Chính:
- `GET /api/v1/departments`: Danh sách chuyên khoa y tế.
- `GET /api/v1/facilities/{facility_source_id:path}`: Tra cứu cơ sở y tế (hỗ trợ ID nguồn chứa dấu gạch chéo).
- `GET /api/v1/doctors`: Danh sách bác sĩ theo chuyên khoa/cơ sở.
- `GET /api/v1/slots`: Danh sách khung giờ khám còn trống.
- `POST /api/v1/slots/hold`: Giữ chỗ tạm thời khung giờ khám bệnh kèm triệu chứng.
- `POST /api/v1/payment/webhook`: Webhook ghi nhận kết quả thanh toán.
- `POST /api/v1/appointments/{id}/confirm`: Xác nhận lịch hẹn khám chính thức sau khi thanh toán.
- `POST /api/v1/appointments/{id}/cancel`: Hủy lịch hẹn khám bệnh.
- `GET/POST/PATCH/DELETE /api/v1/patients/**`: Quản lý hồ sơ bệnh nhân liên kết với tài khoản.

## 3. Cơ Sở Dữ Liệu & Migration

Dịch vụ sở hữu database `xone_healthcare` và quản lý schema bằng các tệp migration SQL tuần tự:
- Các file migration từ `001_initial_schema.sql` đến `005_fix_dataset_tracking.sql`.

## 4. Kiểm Thử

```bash
pytest services/healthcare-service/tests -q
```
