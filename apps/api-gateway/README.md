# API Gateway (NestJS Central Orchestrator)

API Gateway là cổng kết nối công khai duy nhất và là bộ điều phối trung tâm (Central Orchestrator) của hệ sinh thái X-One, được xây dựng trên nền tảng **NestJS**.

## 1. Vai Trò & Ranh Giới Kiến Trúc

- **Biên bảo vệ công khai**: Toàn bộ ứng dụng người dùng cuối (Web và Mobile) chỉ kết nối duy nhất tới API Gateway tại cổng `3000`. Tuyệt đối không để client gọi trực tiếp tới Agent hay các domain service nội bộ.
- **Xác thực & Quản lý phiên thực tế**: Sở hữu bảng người dùng (`users`), thông tin xác thực băm bằng **Argon2id**, cấp phát Access Token JWT ngắn hạn (15 phút) và quản lý xoay vòng Refresh Token trong cookie `HttpOnly` an toàn với cơ chế phát hiện và thu hồi toàn bộ nhóm phiên khi bị dùng lại (token family revocation).
- **Điều phối xác nhận hai bước (Two-Step Confirmation)**: Mọi giao dịch tài chính hoặc giữ chỗ tài nguyên bắt buộc phải đi qua 2 bước xác nhận rõ ràng: bước 1 xác nhận chi tiết dịch vụ/lộ trình và bước 2 xác nhận thanh toán/đặt chỗ cuối cùng.
- **Đảm bảo tính Idempotent**: Mọi thao tác ghi có rủi ro đều yêu cầu header `Idempotency-Key` từ request đầu tiên để ngăn chặn việc tạo trùng lặp giao dịch khi có sự cố mạng.
- **Sở hữu dữ liệu Core**: Quản lý cơ sở dữ liệu `xone_core`, lưu trữ ngữ cảnh người dùng, sổ địa chỉ đã lưu (`saved addresses`), lịch sử hội thoại, thông báo và kế hoạch đa dịch vụ.

## 2. Cấu Trúc Các Module Chính (`src/modules/`)

- `auth`: Xác thực thực tế, đăng ký, đăng nhập, refresh token, đặt lại mật khẩu, quản lý phiên.
- `assistant`: Tiếp nhận tin nhắn trò chuyện, chuyển tiếp tới Agent và xử lý các hành động trợ lý (actions).
- `conversation`: Quản lý danh sách, nội dung tin nhắn và vòng đời các cuộc hội thoại bền vững.
- `tools`: Quản trị Tool Registry v2, adapter kiểm tra chính sách và phân phối công cụ.
- `services`: Khám phá danh mục dịch vụ trên Service Hub, hỗ trợ trạng thái phản hồi suy giảm an toàn (degraded/partial).
- `food`, `ride`, `restaurant`, `healthcare`: Typed Client gọi domain API qua MCP endpoint `XONE_SERVICE_MCP_URL`; không kết nối trực tiếp tới các cổng service.
- `personal`: Quản lý thông tin cá nhân, hồ sơ người dùng và sổ địa chỉ đã lưu.
- `workflow`: Điều phối workflow đa dịch vụ, máy trạng thái kế hoạch và xử lý đền bù (compensation).
- `admin`: Các API quản trị hệ thống, giám sát sức khỏe, người dùng và dữ liệu danh mục.

## 3. Chạy Kiểm Thử & Kiểm Tra Mã Nguồn

```bash
# Kiểm tra cú pháp (Lint)
pnpm run lint

# Chạy Unit test và E2E
pnpm test

# Build ứng dụng
pnpm run build
```
