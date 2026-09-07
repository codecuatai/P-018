# Dịch Vụ Nhà Hàng (Restaurant Service)

Dịch vụ Restaurant chịu trách nhiệm quản lý danh mục quán ăn/nhà hàng phục vụ tại chỗ (dine-in), kiểm tra tình trạng bàn trống (availability), giữ chỗ bàn tạm thời (hold), tạo và cập nhật đơn đặt bàn chính thức (reservations), và xử lý hủy đặt bàn.

## 1. Trách Nhiệm & Ranh Giới Nghiệp Vụ

- **Sở hữu độc quyền**:
  - Thông tin nhà hàng, vị trí, loại hình ẩm thực, khoảng giá ngân sách và sức chứa bàn.
  - Snapshot kiểm tra bàn trống có thẩm quyền trong thời hạn 30 giây (`expires_at`).
  - Quản lý vòng đời giữ chỗ và đặt bàn chính thức.
  - Hỗ trợ cập nhật số lượng khách/thời gian đặt bàn trên cùng một mã ID mà vẫn tăng số version của tài nguyên.
  - Sổ cái kiểm tra tính idempotent của các thao tác đặt/cập nhật/hủy bàn.
- **Không sở hữu**:
  - Thực đơn món ăn và giao hàng tận nơi (thuộc sở hữu của Food Service).
  - Vận chuyển người dùng tới nhà hàng (thuộc Ride Service).
  - Xác thực người dùng và thanh toán (thuộc Gateway/Core).

## 2. API & Ranh Giới Bảo Mật

Toàn bộ các tuyến đường đều nằm dưới tiền tố `/v1` và là API nội bộ:
- Bắt buộc header `X-Internal-Service-Token`.
- Các endpoint thao tác theo người dùng yêu cầu header `X-Actor-Id`.
- Mọi thao tác ghi (`POST /v1/reservation-holds`, `POST /v1/reservations`, `PATCH /v1/reservations/{id}`, `POST /v1/reservations/{id}/cancel`) bắt buộc phải có `Idempotency-Key`.

### Các Tuyến Đường Chính:
- `GET /v1/restaurants`: Tìm kiếm nhà hàng theo từ khóa (`q`), ẩm thực (`cuisine_type`), ngân sách (`budget_range`), và địa điểm.
- `GET /v1/restaurants/{id}`: Xem thông tin chi tiết nhà hàng.
- `POST /v1/restaurants/{id}/availability`: Kiểm tra bàn trống, trả về snapshot có thẩm quyền có giá trị trong 30 giây kèm `snapshot_id`.
- `POST /v1/reservation-holds`: Giữ chỗ bàn tạm thời trước khi người dùng xác nhận.
- `POST /v1/reservation-holds/{id}/cancel`: Giải phóng lượt giữ chỗ khi người dùng thay đổi thông tin.
- `POST /v1/reservations`: Đặt bàn chính thức sau bước xác nhận của Gateway.
- `PATCH /v1/reservations/{id}`: Cập nhật giờ/số lượng khách đặt bàn cùng ID với version tăng dần.
- `POST /v1/reservations/{id}/cancel`: Hủy đặt bàn.

## 3. Cơ Sở Dữ Liệu & Migration

Dịch vụ sở hữu database `xone_restaurant` và sử dụng Alembic để quản lý các revision:
- Quản lý các migration từ `0001` đến `0005`.
- Áp dụng: `alembic upgrade head`.

## 4. Kiểm Thử

```bash
pytest services/restaurant-service/tests -q
```
