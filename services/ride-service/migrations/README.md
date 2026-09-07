# Quản Lý Migration Dịch Vụ Ride (Ride Migrations)

Dịch vụ Ride sở hữu các revision Alembic và chỉ áp dụng chúng lên cơ sở dữ liệu `xone_ride`.

Từ thư mục `services/ride-service/`, chạy lệnh:
```bash
alembic upgrade head
```

- Revision ban đầu: Tạo các bảng báo giá (quote), đặt chuyến (booking), tiêu thụ xác nhận một lần, và bảng kiểm tra tính idempotent.
- Các revision tiếp theo: Bổ sung dữ liệu lộ trình/tài xế, vòng đời rõ ràng của báo giá và chuyến xe.
- Revision `20260816_0006`: Ràng buộc bổ sung số lượng hành khách (`passenger_count`) và phiên bản chính sách sức chứa vào snapshot báo giá và chuyến đi.
- Revision `20260827_0007_quote_snapshot`: Bổ sung snapshot JSON báo giá bất biến vào `ride_bookings`.

Quá trình khởi động ứng dụng tuyệt đối không tự ý tạo hay sửa đổi cấu trúc bảng cơ sở dữ liệu.
