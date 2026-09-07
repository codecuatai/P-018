# Quản Lý Migration Dịch Vụ Healthcare (Healthcare Migrations)

Dịch vụ Healthcare quản lý schema cơ sở dữ liệu `xone_healthcare` qua các tệp migration:
- `001_healthcare_booking.sql`: Khởi tạo schema ban đầu do Healthcare sở hữu.
- `002_healthcare_slot_reuse.sql`: Thay thế ràng buộc unique toàn cục của khung giờ bằng unique index một phần chỉ áp dụng cho các lịch hẹn đang hoạt động.
- `003_patient_user_links.sql`: Thiết lập mối quan hệ giữa tài khoản người dùng và hồ sơ bệnh nhân do Healthcare sở hữu.
- `003a_healthcare_legacy_catalog_bridge.sql`: Tương thích ngược với các cơ sở dữ liệu cũ.
- `004_healthcare_catalog_provenance.sql`: Bổ sung bảng cơ sở y tế, metadata nguồn gốc và các phiên bản dataset.
- `005_healthcare_catalog_nullable_price.sql`: Cho phép giá khám từ nguồn bị thiếu có giá trị NULL; tuyến đặt lịch từ chối khung giờ không có giá thay vì tự tạo giá bằng 0.

Áp dụng các migration tường minh bằng lệnh `scripts/database/migrate.ps1` (hoặc `.sh`) trước khi chạy seed dữ liệu tất định. Quá trình khởi động ứng dụng tuyệt đối không tự tạo hoặc sửa đổi schema lúc runtime.
