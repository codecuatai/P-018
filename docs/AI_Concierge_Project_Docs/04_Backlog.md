# Product Backlog & Feature Breakdown

> **X-ONE ASSISTANT | PRODUCT BACKLOG CHITIẾT DỰ ÁN AI CONCIERGE**  
> **Phân chia theo Epics & User Stories** | **Chuẩn hóa cho Kế hoạch 6 tuần**  

---

## Epic 1: Platform Foundation & Core Architecture (Tuần 1)

### Task / User Story Breakdown:
- **E1-US01 [Auth System]:** Triển khai API Đăng ký, Đăng nhập, Refresh Token Rotation, Mã hóa mật khẩu Argon2/bcrypt và Middleware xác thực JWT.
- **E1-US02 [RBAC Authorization]:** Thiết lập phân quyền vai trò người dùng (Customer, Operator, Administrator).
- **E1-US03 [Database & Monorepo Setup]:** Khởi tạo cấu trúc dự án Python FastAPI + React/Next.js, thiết lập PostgreSQL Database Schema và Redis Cache/Session.
- **E1-US04 [Conversation Management API]:** Xây dựng API Tạo, Xóa, Đổi tên phiên hội thoại, Lưu trữ lịch sử tin nhắn và tích hợp Server-Sent Events (SSE) Streaming.
- **E1-US05 [Chat UI Framework]:** Xây dựng giao diện Chat UI cơ bản, bong bóng tin nhắn (Chat bubble), hiệu ứng Typing indicator và quản lý trạng thái phiên chat.
- **E1-US06 [Agent State Foundation]:** Khởi tạo LangGraph AgentState với 22 biến state cốt lõi và khung Router cơ bản.

---

## Epic 2: Ride Booking Vertical Slice (Tuần 2)

### Task / User Story Breakdown:
- **E2-US01 [Ride Mock Provider API]:** Xây dựng Mock API cho dịch vụ đặt xe (tìm xe, tính cước theo loại xe, thời gian di chuyển, gán tài xế giả lập).
- **E2-US02 [Ride Intent & Slot Extraction]:** Huấn luyện Prompt trích xuất slot: Điểm đi, Điểm đến, Giờ đón, Loại xe (xe máy, 4 chỗ economy, 4 chỗ premium, 7 chỗ).
- **E2-US03 [Ride Cards UI]:** Xây dựng Rich UI Cards cho danh sách kết quả tìm xe, Ride Option Selector Card, và Confirmation Card.
- **E2-US04 [Ride Confirmation & Booking]:** Xây dựng luồng phát hành Confirmation Token, xác thực chữ ký token và thực thi lệnh đặt xe.
- **E2-US05 [Payment Sandbox Integration]:** Kết nối đặt xe với quy trình thanh toán sandbox, tạo hóa đơn và xuất biên nhận.
- **E2-US06 [Realtime Tracking & WebSocket]:** Triển khai WebSocket endpoint phát sự kiện chuyển trạng thái tài xế (Tìm tài xế $\rightarrow$ Đã nhận $\rightarrow$ Đang đến $\rightarrow$ Đang di chuyển $\rightarrow$ Hoàn thành) và tự động reconnect.
- **E2-US07 [Cancel Ride & Fee Calculation]:** Xây dựng chức năng hủy chuyến, tính toán phí hủy xe dựa trên thời gian và hỏi xác nhận từ người dùng.
- **E2-US08 [Ride Idempotency & Audit]:** Gắn Idempotency Key cho thao tác tạo đơn đặt xe và ghi Audit Log giao dịch.

---

## Epic 3: Medical Appointment Vertical Slice (Tuần 3)

### Task / User Story Breakdown:
- **E3-US01 [Medical Mock Provider API]:** Xây dựng Mock API cho danh mục Bệnh viện, Bác sĩ, Chuyên khoa và Khung giờ khám trống.
- **E3-US02 [Medical Intent & Slot Extraction]:** Trích xuất slot: Bệnh viện/Khu vực, Chuyên khoa, Bác sĩ yêu cầu, Ngày giờ khám mong muốn.
- **E3-US03 [Medical Search & Slots UI]:** Xây dựng Rich UI Card hiển thị danh sách phòng khám, thông tin bác sĩ, mức giá và khung giờ khám khả dụng.
- **E3-US04 [Book & Confirmation Flow]:** Xây dựng quy trình xác nhận lịch khám, cấp Confirmation Token và tạo Order lịch khám.
- **E3-US05 [Reschedule & Cancel Medical]:** Xây dựng chức năng đổi giờ khám và hủy lịch khám đã đặt qua ngôn ngữ tự nhiên.
- **E3-US06 [Pre-appointment Instructions]:** Tự động gửi thông tin hướng dẫn chuẩn bị trước khi khám (nhịn ăn, mang giấy tờ tùy thân,...).
- **E3-US07 [Medical Safeguard]:** Đảm bảo Agent tuyệt đối không chẩn đoán bệnh, không kê đơn thuốc hoặc thay thế tư vấn của bác sĩ.

---

## Epic 4: Multi-Service Coordination & Restaurant Extension (Tuần 4)

### Task / User Story Breakdown:
- **E4-US01 [Multi-Service Planning Node]:** Xây dựng Node `build_plan` trong LangGraph có khả năng phân tích câu lệnh phức hợp và tạo cây kế hoạch nhiều bước (Multi-step Dependency Tree).
- **E4-US02 [Travel Time Calculation]:** Tự động tính toán khoảng cách và thời gian di chuyển từ vị trí xuất phát đến phòng khám để đề xuất giờ đón xe hợp lý.
- **E4-US03 [Medical + Ride Coordination Flow]:** Đặt lịch khám bệnh $\rightarrow$ Tự động tính giờ di chuyển $\rightarrow$ Tạo plan đặt xe đón trước 15-20 phút $\rightarrow$ Hiển thị Summary Plan tổng hợp.
- **E4-US04 [Conflict Detection]:** Kiểm tra xung đột thời gian giữa lịch khám và thời gian di chuyển trên đường.
- **E4-US05 [Restaurant Booking Basic]:** Xây dựng Mock API và Tool đặt bàn nhà hàng (tìm nhà hàng, kiểm tra bàn trống, đặt bàn, yêu cầu đặc biệt).
- **E4-US06 [Partial Failure Handling]:** Xử lý khi đặt lịch khám thành công nhưng không tìm được xe (giữ lịch khám, đề xuất chọn loại xe khác hoặc đổi giờ đón mà không rollback mù quáng).

---

## Epic 5: Hardening, Safeguards & Operational Tools (Tuần 5)

### Task / User Story Breakdown:
- **E5-US01 [Bill Payment Sandbox]:** Xây dựng danh sách hóa đơn điện/nước/internet giả lập, preview giao dịch, thanh toán sandbox và xuất biên nhận.
- **E5-US02 [User Memory & Consent Engine]:** Xây dựng hệ thống lưu vết sở thích/địa chỉ quen có sự đồng ý của người dùng, giao diện CRUD Memory (xem, sửa, xóa, tắt memory).
- **E5-US03 [Operator Dashboard & Ticket System]:** Giao diện màn hình vận hành cho Tổng đài viên theo dõi danh sách đơn lỗi, ticket hỗ trợ và chỉ số hệ thống.
- **E5-US04 [Human Handoff Mechanism]:** Triển khai cơ chế chuyển giao cuộc thoại từ AI sang Human Operator khi Agent không xử lý được, kèm theo toàn bộ context.
- **E5-US05 [Prompt Injection Defense]:** Cài đặt các bộ lọc chặn câu lệnh độc hại, ngăn chặn việc tiết lộ System Prompt hoặc tự ý vượt qua bước xác nhận.
- **E5-US06 [150 Test Suite Setup]:** Xây dựng tập dữ liệu 150 kịch bản kiểm thử tự động phục vụ đánh giá Agent.

---

## Epic 6: Production Readiness & Quality Assurance (Tuần 6)

### Task / User Story Breakdown:
- **E6-US01 [End-to-End Integration Testing]:** Chạy kiểm thử E2E toàn bộ các luồng Happy Path, Failure Path và Edge Cases.
- **E6-US02 [Load Testing & Optimization]:** Đánh giá tải với 50 người dùng đồng thời, tối ưu hóa thời gian phản hồi API $< 500\text{ ms}$ và LLM First Token $< 4\text{ s}$.
- **E6-US03 [Production Container Deployment]:** Cấu hình Docker Compose hoàn chỉnh, triển khai ứng dụng lên môi trường Server (Railway/Render/VPS) cùng HTTPS/SSL.
- **E6-US04 [Seed Data Generation]:** Tạo sẵn dữ liệu mẫu cho danh mục nhà hàng, bệnh viện, tài xế, hóa đơn sandbox và tài khoản người dùng thử nghiệm.
- **E6-US05 [Documentation & Metric Reporting]:** Hoàn thiện bộ tài liệu kỹ thuật, xuất báo cáo đánh giá định lượng Success Metrics.
- **E6-US06 [Demo Rehearsal & Video Production]:** Quay video demo các kịch bản chính và chuẩn bị slide thuyết trình hoàn chỉnh.
