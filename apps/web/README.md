# Ứng Dụng Web Frontend (Next.js App Router)

Ứng dụng Web người dùng của X-One được xây dựng bằng **Next.js App Router (React 19)** và **TypeScript**, mang phong cách thiết kế **Calm Kinetic Concierge** (Người trợ lý năng động, điềm tĩnh).

## 1. Kiến Trúc Ứng Dụng

- **Client mỏng, bảo mật**: Gọi trực tiếp tới API Gateway thông qua biến `NEXT_PUBLIC_API_URL`. Toàn bộ Access Token chỉ được lưu trữ trong bộ nhớ RAM của trình duyệt; Refresh Token được quản lý tự động thông qua cookie `HttpOnly`. Tuyệt đối không lưu trữ thông tin nhạy cảm trong `localStorage`.
- **Server Components & Client Islands**: Tối đa hóa việc kết xuất phía server (RSC) cho các layout và trang tĩnh; chỉ sử dụng Client Components ("client islands") cho các tương tác người dùng như khung chat, điều hướng, biểu mẫu và hiệu ứng chuyển động.
- **Hệ thống Design System nhất quán**: Sử dụng bộ token màu sắc, phông chữ **Be Vietnam Pro** và **IBM Plex Mono**, chuẩn khoảng cách 4px và bo góc mềm mại.
- **Trợ năng & Responsive**: Tương thích hoàn hảo từ màn hình di động nhỏ nhất (320px) đến màn hình desktop lớn (1440px), hỗ trợ đầy đủ phím Tab điều hướng và chế độ giảm chuyển động `prefers-reduced-motion`.

## 2. Cấu Trúc Thư Mục (`src/`)

- `app/`: Các tuyến đường theo App Router của Next.js:
  - `(marketing)/`: Trang landing page giới thiệu sản phẩm.
  - `(auth)/`: Các trang đăng ký, đăng nhập, quên mật khẩu và đặt lại mật khẩu.
  - `app/`: Không gian làm việc chính sau khi đăng nhập (`/app` - Trợ lý, `/app/services` - Khám phá dịch vụ, `/app/history` - Lịch sử, `/app/profile` - Hồ sơ cá nhân).
  - `admin/`: Khu vực quản trị hệ thống dành cho Admin.
- `components/`: Các thành phần giao diện dùng chung (Button, Input, Card, Modal, Sheet, Navigation Rail, ContextRail).
- `features/`: Các module tính năng chuyên biệt (assistant, auth, services, history).
- `providers/`: Các Context Provider quản lý trạng thái phiên đăng nhập (`auth-provider.tsx`).
- `styles/`: Định nghĩa các biến CSS toàn cục và lớp tiện ích (`globals.css`).

## 3. Khởi Chạy & Kiểm Thử

```bash
# Cài đặt thư viện với pnpm
corepack pnpm install --frozen-lockfile

# Chạy server phát triển (cổng 5173)
corepack pnpm dev

# Kiểm tra kiểu dữ liệu (TypeScript)
corepack pnpm run typecheck

# Chạy Unit test với Jest
corepack pnpm test

# Chạy kiểm thử trình duyệt Playwright
corepack pnpm exec playwright test
```
