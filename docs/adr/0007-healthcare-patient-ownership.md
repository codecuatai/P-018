# ADR-0007: Quyền Sở Hữu Danh Tính Bệnh Nhân Trong Dịch Vụ Y Tế (Healthcare Patient Ownership)

- Trạng thái: Đã chấp thuận và đã triển khai (Accepted & Implemented)
- Ngày: 2026-08-10
- Chủ sở hữu: Core / API Gateway và Healthcare Service

## Quyết định (Decision)

Dịch vụ Core sở hữu danh tính tài khoản người dùng X-One (`users`) và các tham chiếu phiên xác thực. Dịch vụ Healthcare sở hữu danh tính y tế của bệnh nhân và toàn bộ dữ liệu y tế, bao gồm: hồ sơ bệnh nhân, nhóm máu, tiền sử bệnh, triệu chứng, mối quan hệ bác sĩ/khung giờ/lịch hẹn, và bảng ánh xạ liên kết người dùng với bệnh nhân (`patient_user_links`).

Core chỉ được lưu trữ tham chiếu mờ (opaque reference) tối thiểu phục vụ phân quyền và điều phối luồng. Core **tuyệt đối không lưu trữ tiền sử y tế** hay trở thành chủ sở hữu thứ hai của hồ sơ y tế. API Gateway truyền actor đã xác thực và tham chiếu bệnh nhân Healthcare tường minh qua hợp đồng gọi API; Healthcare tự thẩm định quyền truy cập và quản lý trạng thái bệnh nhân.

## Tính Tương Thích & Cơ Chế Dự Phòng

Biến môi trường `HEALTHCARE_DEFAULT_PATIENT_ID` và dữ liệu mẫu bệnh nhân demo chỉ dùng cho mục đích tương thích phát triển/kiểm thử. Bảng ánh xạ `003_patient_user_links.sql` do Healthcare sở hữu và ranh giới Gateway `/api/v1/healthcare/patients` phân vùng theo actor hiện cung cấp luồng quản lý danh tính thực tế. Phương án fallback chỉ áp dụng trong dev/test khi chưa chọn liên kết bệnh nhân; trên môi trường production, nếu thiếu liên kết bệnh nhân, Gateway sẽ trả về lỗi `PATIENT_LINK_REQUIRED` thay vì tự ý chọn ngầm một bệnh nhân.

## Hệ quả (Consequences)

Các phản hồi API từ Healthcare có thể trả về thông tin cơ sở y tế và dữ kiện bệnh nhân/lịch hẹn do Healthcare sở hữu. API Gateway có thể tổng hợp các dữ kiện này để hiển thị trên giao diện nhưng không thể tự tạo, lưu trữ hoặc cập nhật dữ liệu y tế trong cơ sở dữ liệu của Core.
