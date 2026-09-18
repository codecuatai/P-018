# ADR-0005: Kiến Trúc Xác Thực Và Quản Lý Phiên Mục Tiêu (Auth & Session Architecture)

- Trạng thái: Đã chấp thuận và đã triển khai đầy đủ cho Giai đoạn 1 (Accepted & Implemented)
- Ngày: 2026-08-10
- Chủ sở hữu: Core / API Gateway

## Ngữ cảnh (Context)

Ban đầu, Gateway chỉ có cơ chế đăng nhập tài khoản demo và cấp token ngắn hạn dùng cho phát triển. Hệ thống thiếu bảng lưu trữ người dùng/phiên, luồng cookie refresh, tính năng đặt lại mật khẩu và nhà cung cấp danh tính cấp độ sản xuất.

## Quyết định (Decision)

Hệ thống xác thực thực tế sử dụng các tiêu chuẩn sau:

1. **Argon2id** cho thuật toán băm mật khẩu. Nghiêm cấm lưu mật khẩu dạng văn bản thô hoặc mã hóa có thể giải ngược.
2. **Access Token JWT ngắn hạn** với thời gian sống từ 10–15 phút (`AUTH_ACCESS_TOKEN_TTL_SECONDS=900`). Token chứa issuer, audience, subject, mã định danh phiên (session ID), thời gian cấp phát, thời gian hết hạn và claim định danh duy nhất.
3. **Refresh Token dài hạn trong cookie `HttpOnly`**. Chỉ lưu trữ mã băm SHA-256 của refresh token trong cơ sở dữ liệu. Token chỉ dùng một lần và tự động xoay vòng (rotate) trong một nhóm thế hệ (token family); phát hiện hành vi tái sử dụng (replay attack) sẽ ngay lập tức thu hồi toàn bộ nhóm phiên.
4. **Cờ `Secure`** trên cookie refresh ở mọi môi trường ngoài HTTP dev cục bộ. Mặc định sử dụng `SameSite=Lax`.
5. **Xác thực Origin/Referer** cho mọi thao tác thay đổi trạng thái có cookie. Từ chối request nếu thiếu Origin hoặc Origin không nằm trong danh sách tin cậy.
6. **Kiểm soát phiên làm việc**: Hỗ trợ xem danh sách phiên, hủy phiên hiện tại, hủy toàn bộ phiên, đăng xuất và tự động vô hiệu hóa tất cả phiên khi đổi mật khẩu; token đặt lại mật khẩu dùng một lần, có thời hạn và chỉ lưu dạng băm.
7. **Bảo vệ môi trường**: Chế độ demo auth chỉ khả dụng khi `APP_ENV` là `development` hoặc `test`; nếu đặt `APP_ENV=production` mà bật demo auth sẽ báo lỗi dừng khởi động ngay lập tức (fail-fast).

API Gateway là ranh giới xác thực công khai duy nhất. Các domain service không tự quản lý bảng người dùng/phiên riêng và không tiếp nhận thông tin đăng nhập của trình duyệt. Dịch vụ Core sở hữu toàn bộ metadata danh tính, phiên và xác nhận.

## Hệ quả (Consequences)

Đã bổ sung migration `009_core_auth.sql` do Core sở hữu, các bài kiểm thử mật khẩu/phiên, hợp đồng OpenAPI `gateway-auth-v1.yaml`, kiểm tra tích hợp cookie/CSRF, kiểm tra thu hồi phiên và phát hiện replay.
