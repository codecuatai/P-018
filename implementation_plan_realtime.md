# Kế hoạch Triển khai Cập nhật Trạng thái Thời gian thực (Real-time Status Updates)

## Mục tiêu (Goal)
Thay thế cơ chế Polling hiện tại của hệ thống thành cơ chế Push (Đẩy). Bất cứ khi nào đơn hàng/chuyến xe thay đổi trạng thái (Tài xế nhận, Tài xế đến, Đơn chuẩn bị xong...):
1. **Nếu đang ở màn hình chat:** Đẩy cập nhật thẳng vào giao diện chat dưới dạng tin nhắn của Assistant.
2. **Nếu không ở màn hình chat:** Gửi Notification. Khi bấm "Xem chi tiết", mới bật lên thẻ UI chứa đầy đủ thông tin.

## Hiện trạng Hệ thống (Current Architecture)
Qua kiểm tra mã nguồn `ride_service` (Python), `product-ops.service.ts` (NestJS) và React (Frontend):
- **Lazy Evaluation (Đánh giá lười):** Backend (ví dụ `ride_service.py`) **không** chạy ngầm để cập nhật trạng thái. Khi Frontend gọi API `get_tracking` (mỗi 1 giây), code mới tính toán thời gian trôi qua (`tracking_elapsed`) và đẩy trạng thái lên bước tiếp theo (`transition_booking`).
- **Thông báo (Notifications):** API Gateway (`syncNotifications`) chủ động gọi hỏi các dịch vụ, nếu thấy trạng thái khác trước sẽ ghi log vào DB.
- **Chat:** Chỉ hỗ trợ HTTP Request/Response một chiều.

## Các thay đổi đề xuất (Proposed Changes)

> [!WARNING]
> **Đây là một thay đổi lớn về mặt Kiến trúc (Architectural Change).** Việc chuyển từ Lazy Polling sang Real-time Push yêu cầu thêm Message Broker (Redis/Kafka) và sửa lại đáng kể cách Frontend/Gateway giao tiếp.

### 1. Backend Service (Python)
- Cần có cơ chế phát sinh sự kiện (Emit Event). Tạm thời, do đặc thù Lazy Evaluation, khi Gateway hoặc Background Worker kiểm tra và làm thay đổi trạng thái, service cần đẩy sự kiện lên một kênh `Pub/Sub` (ví dụ Redis).

### 2. API Gateway (NestJS)
- Bổ sung module **WebSocket** (hoặc Server-Sent Events - SSE).
- Gateway sẽ "lắng nghe" (Subscribe) các sự kiện từ kênh Pub/Sub.
- Khi nhận sự kiện:
  - Kiểm tra xem User có đang kết nối Socket không.
  - Phân loại để gửi sự kiện xuống: `CHAT_UPDATE` (nếu user đang trong room chat) hoặc `PUSH_NOTIFICATION` (nếu user ở ngoài chat).

### 3. Frontend (React / Web / Mobile)
- **Hủy bỏ Polling:** Bỏ cơ chế `setInterval` / `useRideTracking` thăm dò mỗi giây. Thay bằng lắng nghe qua WebSocket.
- **Giao diện Chat:** Khi nhận `CHAT_UPDATE`, nối thêm một đoạn tin nhắn vào lịch sử chat hiện tại (ví dụ: *"Tài xế Nguyễn Văn A đã nhận đơn"*), kèm theo UI Card chi tiết nếu cần.
- **Thông báo (Notifications):** Khi nhận `PUSH_NOTIFICATION`, hiển thị thông báo popup mỏng (Toast) với tiêu đề/nội dung ngắn gọn. Bấm "Xem chi tiết" sẽ gọi state để mở UI Item chi tiết mà không làm gián đoạn luồng chat.

## User Review Required
> [!IMPORTANT]
> Việc xây dựng Pub/Sub và WebSocket là thay đổi lớn tốn nhiều thời gian. Bạn có chắc chắn muốn tiến hành cải tổ toàn bộ luồng real-time này ngay bây giờ không? Hay muốn giải quyết bằng cách áp dụng "giả lập" hiển thị từ Frontend trước (Frontend tự chèn tin nhắn vào chat khi Polling thấy trạng thái thay đổi)?
