# Danh Sách Kiểm Tra Đảm Bảo Chất Lượng Trực Quan (Visual QA Checklist)

Sử dụng danh sách kiểm tra này sau khi thực hiện các thay đổi về giao diện người dùng (UI). Ảnh chụp màn hình trình duyệt thực tế hoặc lượt chạy Playwright cục bộ là bằng chứng cho bố cục; các bài kiểm tra unit test hoặc typecheck đơn thuần không thể thay thế cho nghiệm thu trực quan.

## Các Bề Mặt Bắt Buộc Kiểm Tra

- [ ] **Giao diện Trợ lý `/app` sau đăng nhập**: Không để lộ các lệnh nội bộ của trợ lý dạng văn bản thô.
- [ ] **Khung ứng dụng (App Shell)**: Kiểm tra thanh điều hướng trên desktop, tablet và mobile; logo biểu trưng và tên thương hiệu phải nằm trên cùng một dòng.
- [ ] **Các trạng thái của Ride**: Báo giá, bước xác nhận, tìm tài xế, tài xế đã nhận chuyến, chuyến đi đang chạy, trạng thái hoàn tất/kết thúc và trạng thái dự phòng bản đồ khi lỗi tile.
- [ ] **Các bề mặt dịch vụ**:
  - Food: Thực đơn, tùy biến món, giỏ hàng, đặt hàng.
  - Restaurant: Chi tiết quán, kiểm tra bàn trống, giữ chỗ.
  - Healthcare: Duyệt khoa, chi tiết bác sĩ, chọn khung giờ, xác nhận lịch hẹn.
  - Trang cá nhân / Lịch sử: Danh sách địa chỉ, quản lý tài khoản, lịch sử đơn/chuyến.
- [ ] **Các trạng thái biên**: Đang tải (Loading), Trống (Empty), Thành công từng phần (Partial), Báo lỗi (Error), Nút thử lại (Retry) và xử lý khi không có ảnh (No-image fallback) trên mọi bề mặt bị thay đổi.

## Độ Phân Giải Màn Hình & Tiêu Chí Đánh Giá

- [ ] **Các độ phân giải chuẩn**:
  - Mobile nhỏ: `320×800`
  - Mobile chuẩn: `390×844`
  - Tablet dọc: `768×1024`
  - Tablet ngang / Laptop nhỏ: `1024×768`
  - Desktop: `1440×900`
- [ ] **Không tràn ngang**: Tuyệt đối không xuất hiện thanh cuộn ngang ngoài ý muốn; tiêu đề, nút bấm, nhãn và văn bản trạng thái phải luôn rõ ràng, dễ đọc.
- [ ] **Trợ năng**: Thứ tự phím Tab hợp lý, viền focus bàn phím nhìn rõ, tên trợ năng đầy đủ cho icon button, `aria-live` hoạt động đúng cho cập nhật trạng thái, và chế độ `prefers-reduced-motion` được hỗ trợ chuẩn mực.
- [ ] **Bản đồ**: Khung bản đồ có kích thước cố định rõ ràng, có dòng ghi nhận bản quyền OpenStreetMap, chỉ hiển thị tọa độ đã xác minh và có phương án fallback trung thực khi tải tile bản đồ thất bại.
- [ ] **Mạng & Console**: Xác nhận toàn bộ request mạng chỉ gọi duy nhất vào API Gateway và không có bất kỳ lỗi console màu đỏ nào phát sinh trên trình duyệt.
