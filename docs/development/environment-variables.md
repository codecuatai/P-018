# Quản Lý Biến Môi Trường (Environment Variables)

Tệp gốc `.env.example` là nguồn chân lý (source of truth) cho Docker Compose cục bộ. Tệp này nhóm các thiết lập dùng chung, tài khoản quản trị PostgreSQL và cơ sở dữ liệu logic, URL kết nối database theo từng service, cổng/URL nội bộ, cấu hình bảo mật Gateway, cấu hình Gemini và cấu hình Langfuse tùy chọn. Tệp mẫu chỉ chứa các giá trị giữ chỗ (placeholders). Mẫu cấu hình mặc định đặt `AGENT_MODEL_MODE=gemini`, nhưng khi để trống `GEMINI_API_KEY`, môi trường phát triển cục bộ sẽ tự động kích hoạt bộ lập kế hoạch tất định dự phòng (deterministic fallback); khi điền khóa API hợp lệ, hệ thống sẽ sử dụng mô hình LLM thực tế.

## Phân Phối Biến Môi Trường Trong Docker Compose

Docker Compose tự động đọc tệp gốc `.env` để nội suy các biến `${VARIABLE}`, nhưng **không truyền toàn bộ tệp vào các container**:
- **PostgreSQL**: Chỉ nhận các biến khởi tạo database và tài khoản quản trị/người dùng logic.
- **API Gateway**: Nhận cấu hình kết nối database Core (`xone_core`), các URL nội bộ của service con, token xác thực nội bộ, `APP_ENV`, `CORE_AUTO_MIGRATE`, allowlist CORS, giới hạn kích thước request body, cấu hình rate-limit, thiết lập Auth thực tế và cấu hình demo auth cho môi trường dev/test.
- **Agent Service**: Nhận database agent (`xone_agent`), khóa API Gemini, 3 tham số Langfuse, cấu hình CORS và token nội bộ.
- **Healthcare Service**: Nhận database (`xone_healthcare`), token nội bộ và thông tin cơ sở do domain sở hữu (`HEALTHCARE_FACILITY_NAME`, `HEALTHCARE_FACILITY_ADDRESS`).
- **Food Service**: Chỉ nhận database (`xone_food`), token nội bộ và các thiết lập persistence, giao hàng, từ chối đơn cùng workflow hẹn giờ.
- **Web Frontend**: Chỉ nhận các giá trị build-time có tiền tố `NEXT_PUBLIC_*` tại thời điểm đóng gói hoặc chạy dev, tuyệt đối không nhận khóa Gemini, Langfuse hay token nội bộ.

> [!WARNING]
> Cấu hình `CORE_AUTO_MIGRATE=true` chỉ là tiện ích dành riêng cho môi trường phát triển (`APP_ENV=development`). Trên môi trường Production, biến này bắt buộc phải đặt là `false`. Biến `FOOD_PERSISTENCE` bắt buộc phải là `postgres` trên production; chế độ `memory` chỉ là adapter cho dev/test.

---

## Bảng Chi Tiết Biến Môi Trường Theo Nhóm

### 1. Cấu Hình Chung & Hệ Thống (General & System)

| Biến môi trường | Mục đích | Môi trường Dev | Yêu cầu Production |
| --- | --- | --- | --- |
| `APP_ENV` | Môi trường ứng dụng (`development`, `test`, `production`) | `development` | Bắt buộc `production` |
| `TZ` | Múi giờ hệ thống | `Asia/Ho_Chi_Minh` | `Asia/Ho_Chi_Minh` |
| `INTERNAL_SERVICE_TOKEN` | Token bí mật chia sẻ xác thực giữa Gateway và các service domain nội bộ qua header `X-Internal-Service-Token` | Chuỗi mẫu bí mật | Chuỗi ngẫu nhiên bảo mật cao (tối thiểu 32 ký tự) |

### 2. Cấu Hình Cơ Sở Dữ Liệu PostgreSQL (Logical Databases)

Một máy chủ PostgreSQL duy nhất phân chia thành 6 logical database độc lập, mỗi domain sở hữu 1 user và 1 database riêng biệt:

| Biến môi trường | Mục đích | Giá trị mặc định / Ghi chú |
| --- | --- | --- |
| `POSTGRES_HOST` / `POSTGRES_PORT` | Địa chỉ host và cổng của PostgreSQL | Host DNS `postgres` trong Compose, cổng `5432` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | Tài khoản superuser dùng khởi tạo và chạy migration | `postgres` / chuỗi mật khẩu mạnh |
| `POSTGRES_DB` | Cơ sở dữ liệu mặc định ban đầu | `xone_core` |
| `CORE_DB_NAME` / `USER` / `PASSWORD` | Database & User logic cho Core / Gateway | `xone_core` / `xone_core_user` |
| `AGENT_DB_NAME` / `USER` / `PASSWORD` | Database & User logic cho Agent | `xone_agent` / `xone_agent_user` |
| `RIDE_DB_NAME` / `USER` / `PASSWORD` | Database & User logic cho Ride | `xone_ride` / `xone_ride_user` |
| `RESTAURANT_DB_NAME` / `USER` / `PASSWORD` | Database & User logic cho Restaurant | `xone_restaurant` / `xone_restaurant_user` |
| `HEALTHCARE_DB_NAME` / `USER` / `PASSWORD` | Database & User logic cho Healthcare | `xone_healthcare` / `xone_healthcare_user` |
| `FOOD_DB_NAME` / `USER` / `PASSWORD` | Database & User logic cho Food | `xone_food` / `xone_food_user` |
| `CORE_DATABASE_URL` | Chuỗi kết nối SQLAlchemy/TypeORM của Gateway | `postgresql://.../xone_core` |
| `AGENT_DATABASE_URL` | Chuỗi kết nối của Agent Service | `postgresql://.../xone_agent` |
| `RIDE_DATABASE_URL` | Chuỗi kết nối của Ride Service | `postgresql://.../xone_ride` |
| `RESTAURANT_DATABASE_URL` | Chuỗi kết nối của Restaurant Service | `postgresql://.../xone_restaurant` |
| `HEALTHCARE_DATABASE_URL` | Chuỗi kết nối của Healthcare Service | `postgresql://.../xone_healthcare` |
| `FOOD_DATABASE_URL` | Chuỗi kết nối asyncpg của Food Service | `postgresql://.../xone_food` |

### 3. API Gateway & Bảo Mật (Gateway & Security)

| Biến môi trường | Mục đích | Mặc định | Ghi chú Production |
| --- | --- | --- | --- |
| `GATEWAY_PORT` | Cổng công khai của API Gateway | `3000` | Expose ra reverse proxy |
| `GATEWAY_CORS_ORIGINS` | Danh sách các origin được phép kết nối CORS (phân tách bằng dấu phẩy) | `http://localhost:5173,http://localhost:3000` | Tên miền HTTPS cụ thể; cấm wildcard (`*`) và localhost |
| `GATEWAY_BODY_LIMIT_BYTES` | Giới hạn kích thước tối đa của body request | `262144` (256 KB) | Ngăn chặn tấn công làm cạn kiệt bộ nhớ |
| `GATEWAY_RATE_LIMIT_WINDOW_SECONDS` | Cửa sổ thời gian áp dụng rate limit | `60` giây | Tính theo giây |
| `GATEWAY_AUTH_LOGIN_RATE_LIMIT` | Giới hạn số lần thử đăng nhập trong 1 window | `10` | Ngăn chặn tấn công brute-force mật khẩu |
| `GATEWAY_AUTH_REFRESH_RATE_LIMIT` | Giới hạn số lần refresh token | `60` | Cho phép điều hướng trang mà không hết quota |
| `GATEWAY_ASSISTANT_CHAT_RATE_LIMIT` | Giới hạn số tin nhắn chat gửi tới Assistant | `30` | Ngăn chặn lạm dụng tài nguyên LLM |
| `GATEWAY_ASSISTANT_ACTION_RATE_LIMIT` | Giới hạn thao tác thực thi action | `30` | Bảo vệ các giao dịch chốt đơn/chuyến |
| `GATEWAY_FUTURE_AUTH_RATE_LIMIT` | Giới hạn các endpoint auth khác | `30` | Áp dụng cho đăng ký, quên mật khẩu |
| `GATEWAY_PROVIDER_SERVICES_RATE_LIMIT` | Giới hạn ghi/sửa/xóa dịch vụ đối tác và cập nhật hồ sơ | `60` | Ngăn chặn spam cập nhật và DDoS các endpoint provider |
| `AUTH_ACCESS_TOKEN_TTL_SECONDS` | Thời gian sống của Access Token JWT | `900` (15 phút) | Ngắn hạn, lưu trên RAM |
| `AUTH_REFRESH_TOKEN_TTL_SECONDS` | Thời gian sống của Refresh Token | `604800` (7 ngày) | Opaque token, lưu hash trong DB |
| `AUTH_REFRESH_REUSE_GRACE_SECONDS` | Thời gian ân hạn tái sử dụng refresh token vừa dùng | `5` (0 - 300 giây) | Chống race-condition khi trình duyệt mở nhiều tab |
| `AUTH_RESET_TOKEN_TTL_SECONDS` | Thời gian sống của token reset mật khẩu | `3600` (1 giờ) | Dùng 1 lần |
| `AUTH_ISSUER` / `AUTH_AUDIENCE` | Claim Issuer và Audience trong JWT | `xone-api-gateway` / `xone-clients` | Kiểm tra nghiêm ngặt chữ ký |
| `AUTH_REFRESH_COOKIE_NAME` | Tên cookie chứa Refresh Token | `xone_refresh_token` | HttpOnly, SameSite=Lax, Secure trên prod |
| `AUTH_DEV_RESET_TOKEN_CAPTURE` | Cờ chụp lại reset token trong response test | `true` (chỉ dev) | Bắt buộc `false` trên production |
| `DEMO_AUTH_ENABLED` | Bật tính năng xác thực tài khoản demo | `true` (chỉ dev) | Bắt buộc `false` trên production |

### 4. Dịch Vụ AI Agent & Observability

| Biến môi trường | Mục đích | Ghi chú & Giá trị |
| --- | --- | --- |
| `AGENT_SERVICE_PORT` | Cổng HTTP nội bộ của Agent Service | `8001` |
| `AGENT_MODEL_MODE` | Chế độ mô hình (`gemini` hoặc `deterministic`) | Mặc định `gemini`. Nếu thiếu API key sẽ fallback sang `deterministic` |
| `GEMINI_API_KEY` | Khóa API Google Gemini duy nhất | Khóa cá nhân từ Google AI Studio |
| `GEMINI_API_KEYS` | Danh sách nhiều khóa API Gemini (phân tách bởi dấu phẩy `key1,key2,key3`) | Tự động cân bằng tải Round Robin và failover khi gặp lỗi giới hạn hạn mức (HTTP 429) |
| `GEMINI_MODEL_NAME` | Định danh model Gemini sử dụng | Mặc định `gemini-2.5-flash` |
| `AGENT_PERSISTENCE_MODE` | Cơ chế lưu metadata lượt chạy của Agent | `required_postgres` (trong Compose) hoặc `memory` (chỉ khi test/dev riêng lẻ) |
| `LANGFUSE_PUBLIC_KEY` | Khóa công khai của Langfuse tracing | Khóa từ dự án Langfuse v4 |
| `LANGFUSE_SECRET_KEY` | Khóa bí mật của Langfuse tracing | Khóa bí mật từ Langfuse |
| `LANGFUSE_BASE_URL` | Endpoint của Langfuse server | Ví dụ `https://us.cloud.langfuse.com` |

> [!NOTE]
> Adapter Langfuse được bảo vệ nghiêm ngặt: chỉ ghi nhận metadata (thời gian chạy, tên capability, model latency, mã lỗi an toàn). Không bao giờ gửi prompt thô, tin nhắn người dùng, trạng thái hội thoại hay thông tin PII nhạy cảm lên Langfuse.

### 5. Cấu Hình Dịch Vụ Domain (Domain Services)

#### Ride Service (Cổng 8101)
- `RIDE_SERVICE_PORT`: Cổng dịch vụ, mặc định `8101`.
- `RIDE_TRACKING_TIME_SCALE`: Hệ số tua nhanh thời gian giả lập chuyến đi. Giá trị mặc định là `1.0`. Trong môi trường test/demo cục bộ có thể đặt `60` để chuyến đi hoàn thành trong vài giây. Production bắt buộc phải là `1.0`.

#### Restaurant Service (Cổng 8102)
- `RESTAURANT_SERVICE_PORT`: Cổng dịch vụ, mặc định `8102`.
- Khả năng kiểm tra bàn trống trả về snapshot có thẩm quyền có giá trị trong 30 giây (`expires_at`).

#### Healthcare Service (Cổng 8103)
- `HEALTHCARE_SERVICE_PORT`: Cổng dịch vụ, mặc định `8103`.
- `HEALTHCARE_FACILITY_NAME`: Tên cơ sở y tế quản lý mặc định.
- `HEALTHCARE_FACILITY_ADDRESS`: Địa chỉ cơ sở y tế.
- `HEALTHCARE_DEFAULT_PATIENT_ID`: ID hồ sơ bệnh nhân demo mặc định (chỉ dùng cho môi trường dev/test khi chưa gắn liên kết người dùng thực tế).

#### Food Service (Cổng 8104)
- `FOOD_SERVICE_PORT`: Cổng dịch vụ, mặc định `8104`.
- `FOOD_PERSISTENCE`: Bắt buộc là `postgres` trong Compose và Production; chỉ cho phép `memory` khi chạy test cô lập.
- `FOOD_CATALOG_IMPORT_DRY_RUN`: Cờ kiểm tra dữ liệu danh mục mà không ghi vào database (`false`).

### 6. Cấu Hình Frontend Web (Next.js App Router)

| Biến môi trường | Mục đích | Phạm vi hiển thị |
| --- | --- | --- |
| `WEB_PORT` | Cổng container của Web App | Host port `5173` |
| `NEXT_PUBLIC_API_URL` | URL công khai của API Gateway mà trình duyệt gọi vào | `http://localhost:3000` (Dev) hoặc URL domain công khai (Prod) |
| `NEXT_PUBLIC_HERO_VIDEO_URL` | URL video nền trang landing (tùy chọn) | Công khai trên trình duyệt |
| `NEXT_PUBLIC_HERO_POSTER_URL` | URL ảnh poster cho video nền (tùy chọn) | Công khai trên trình duyệt |

---

## Nguyên Tắc Vàng Về Bảo Mật Cấu Hình

1. **Không bao giờ commit tệp `.env` vào Git**: Tệp `.env` luôn nằm trong `.gitignore`.
2. **Không truyền secret ra client Web**: Tất cả các biến `NEXT_PUBLIC_*` đều hiển thị với người dùng trên trình duyệt. Tuyệt đối không đặt khóa bí mật, token nội bộ hay URL DNS private vào đây.
3. **Không chia sẻ thông tin database chéo giữa các service**: Mỗi domain service chỉ được biết chuỗi kết nối đến logical database của chính mình.
4. **Kiểm tra tự động trước khi triển khai**: Luôn chạy script kiểm tra tính hợp lệ:
   ```bash
   python scripts/quality/validate-env-config.py
   docker compose --env-file .env.example config --quiet
   ```
