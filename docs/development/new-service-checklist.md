# Danh Sách Kiểm Tra Khi Thêm Dịch Vụ Mới (New Service Checklist)

Tài liệu này cung cấp danh sách kiểm tra từng bước chuẩn hóa dành cho kỹ sư hoặc AI agent khi tích hợp hoặc xây dựng một microservice domain mới vào hệ sinh thái X-One.

## 1. Khởi Tạo Mã Nguồn & Ranh Giới Service

- [ ] **Vị trí thư mục**: Đặt tại `services/<service-name>` (hoặc `apps/<service-name>` nếu là ứng dụng điều phối/agent).
- [ ] **Công nghệ**: Sử dụng Python (FastAPI, Pydantic v2, SQLAlchemy/asyncpg) hoặc TypeScript/NestJS theo quy chuẩn nghiêm ngặt (strict types, no bare `except`).
- [ ] **Dockerfile**: Tạo Dockerfile đa tầng (multi-stage build), non-root user, kích hoạt liveness probe và có file `.dockerignore` chuẩn xác.
- [ ] **Tệp cấu hình mẫu**: Tạo `.env.example` độc lập bên trong thư mục service, chỉ liệt kê các biến thuộc thẩm quyền của service đó.
- [ ] **Kiểm tra sức khỏe (Health Endpoints)**:
  - `GET /health/live`: Phản hồi `200 OK` khi tiến trình web server đang hoạt động.
  - `GET /health/ready`: Phản hồi `200 OK` khi các kết nối cần thiết (database của chính nó) đã sẵn sàng.

## 2. Ranh Giới Dữ Liệu & Migration

- [ ] **Logical Database riêng biệt**: Cấp phát tên database độc quyền (ví dụ `xone_<domain>`), user (`xone_<domain>_user`) và mật khẩu riêng.
- [ ] **Tuyệt đối không dùng chung**: Không truy vấn SQL chéo database, không tạo foreign key sang bảng của service khác, không dùng chung model ORM.
- [ ] **Migration thuộc quyền sở hữu**:
  - Viết migration bằng Alembic hoặc các tệp SQL thuần có đánh số thứ tự tăng dần.
  - Tuyệt đối không dùng `create_all()` lúc runtime trong production.
  - Đảm bảo migration có tính idempotent và có thể chạy lặp lại an toàn.
- [ ] **Dữ liệu mẫu (Seed)**: Cung cấp script seed tất định bổ sung (additive seed), không xóa dữ liệu đang có.

## 3. Cấu Hình Docker Compose & Môi Trường

- [ ] **Cập nhật root `.env.example`**: Bổ sung các biến môi trường của service mới với giá trị giữ chỗ (placeholder) an toàn.
- [ ] **Khai báo trong `docker-compose.yml`**:
  - Ánh xạ rõ ràng các biến môi trường từ root `.env` (không dùng `env_file`).
  - Gắn vào mạng nội bộ `xone-network`.
  - Cấu hình healthcheck định kỳ 30s với `start_period`.
  - Thiết lập giới hạn tài nguyên hợp lý (`deploy.resources.limits.memory`).
- [ ] **Khởi tạo database trong PostgreSQL**: Bổ sung lệnh tạo database/user trong `docker/postgres/init-databases.sh`.
- [ ] **Cập nhật công cụ kiểm tra**: Bổ sung service vào `scripts/quality/validate-env-config.py` và `scripts/database/check-migration-parity.py`.

## 4. Tích Hợp API Gateway & Hợp Đồng Dữ Liệu

- [ ] **Tạo Typed Client tại Gateway**:
  - Tạo service client trong `apps/api-gateway/src/modules/<service>/` kế thừa client HTTP chuẩn của Gateway.
  - Inject cấu hình URL nội bộ (ví dụ: `http://<service-name>:<port>`).
  - Truyền header xác thực nội bộ `X-Internal-Service-Token` và `X-Correlation-Id`.
  - **Nghiêm cấm**: Tuyệt đối không cấp chuỗi kết nối database của domain cho Gateway.
- [ ] **Hợp đồng công cụ (Tool Contract) & Registry**:
  - Định nghĩa hợp đồng công cụ trong `packages/contracts/tools/tool-registry-v2.json` nếu Agent cần tương tác.
  - Đăng ký adapter tương ứng trong `apps/api-gateway/src/modules/tools/tool-registry.ts`.
- [ ] **Cơ chế xác nhận 2 bước & Idempotency**:
  - Mọi thao tác ghi/đặt chỗ tài chính hoặc giữ tài nguyên phải hỗ trợ `Idempotency-Key`.
  - Trả về snapshot báo giá có thời hạn (`expires_at`) cho bước xác nhận đầu tiên.

## 5. Kiểm Thử & Đảm Bảo Chất Lượng

- [ ] **Unit Tests**: Kiểm thử toàn bộ logic domain và schema validation (sử dụng pytest hoặc jest).
- [ ] **Contract Tests**: Kiểm tra tính tương thích giữa OpenAPI schema và typed client của Gateway.
- [ ] **Tích hợp liên dịch vụ**: Bổ sung kịch bản kiểm thử vào `tests/e2e/` để xác minh tương tác qua HTTP từ Gateway sang service.
- [ ] **Kiểm tra cú pháp**: Chạy `ruff check` (Python) hoặc `eslint` (TypeScript) không còn bất kỳ lỗi nào.

## 6. Cập Nhật Tài Liệu Kỹ Thuật

- [ ] Cập nhật bảng cổng dịch vụ trong `docs/architecture/system-overview.md` và `docs/architecture/runtime-architecture.md`.
- [ ] Cập nhật ranh giới trách nhiệm trong `docs/architecture/service-boundaries.md`.
- [ ] Cập nhật sơ đồ cơ sở dữ liệu trong `docs/architecture/data-architecture.md`.
- [ ] Bổ sung tệp `README.md` chi tiết bên trong thư mục service (`services/<service-name>/README.md`).
- [ ] Cập nhật danh mục API trong `docs/api/api-inventory.md`.

## 7. Nghiệm Thu & Đánh Giá Cuối Cùng

Chạy lệnh kiểm tra tính toàn vẹn:

```powershell
python scripts/quality/validate-env-config.py
docker compose --env-file .env.example config --quiet
python scripts/database/check-migration-parity.py
```
- [ ] Xác nhận toàn bộ bài kiểm tra tĩnh và docker compose config chạy qua không có cảnh báo.
- [ ] Trạng thái triển khai phản ánh trung thực: dán nhãn `implemented` khi đã kiểm tra thực tế, `skeleton` nếu chỉ mới có khung, hoặc `planned` nếu đang trong lộ trình.
