# Kiểm Thử E2E Liên Dịch Vụ (Cross-Service E2E Tests)

Đây là tầng kiểm thử tích hợp liên dịch vụ: điều khiển API Gateway thực tế cùng với Agent, Ride, Restaurant, Healthcare và Food, đồng thời can thiệp vào stack bằng lệnh `docker compose exec`/`restart`. Bộ kiểm thử này **bắt buộc phải có runtime Docker Compose** và không thể chạy trên môi trường tiến trình trực tiếp (`scripts/local/local-dev.ps1`).

## Khởi Chạy Kiểm Thử

Chạy đối chiếu với Gateway Compose đang hoạt động:

```bash
E2E_GATEWAY_URL=http://localhost:3000 python -m pytest tests/e2e -q
```

Từ workspace gốc, bạn có thể chạy: `corepack pnpm test:e2e:crossservice`.

Script `scripts/local/local-acceptance.ps1` chạy bộ kiểm thử này như một bước bắt buộc và tự động trích xuất cấu hình từ tệp `-EnvFile`.

| Biến môi trường | Mặc định | Mục đích |
| --- | --- | --- |
| `E2E_GATEWAY_URL` | Chưa đặt | URL cơ sở của Gateway công khai. Bắt buộc. |
| `E2E_REQUIRE_GATEWAY` | Chưa đặt | Khi được bật, nếu thiếu URL Gateway sẽ báo lỗi `UsageError` thay vì âm thầm bỏ qua. |
| `E2E_COMPOSE_PROJECT_NAME` | `p-018` | Tên dự án Compose đồng bộ với stack. |
| `E2E_COMPOSE_ENV_FILE` | `.env.example` | Tệp env truyền cho Docker Compose. |
| `E2E_DEMO_EMAIL` / `E2E_DEMO_PASSWORD` | Mẫu từ `.env.example` | Tài khoản đăng nhập demo cục bộ. |
| `E2E_TOKEN_TTL_SECONDS` | `600` | Thời gian sống của bộ nhớ đệm access-token. |

## Các Bộ Test Chính

- `test_food_vertical_slice.py`: Quy trình Gateway → Agent → Food: đặt món, xác nhận, thanh toán/khôi phục, idempotency, hoàn tiền, quyền sở hữu và bảo toàn dữ liệu khi restart.
- `test_four_domain_workflows.py`: Xác nhận 2 bước của Ride, giữ chỗ/xác nhận đặt bàn Restaurant, giữ chỗ/thanh toán/xác nhận/hủy lịch hẹn Healthcare.
- `test_unified_assistant.py`: Bề mặt hội thoại trợ lý hợp nhất cho cả 4 domain, kiểm tra replay action, tính cũ kỹ của action, chuyển giao nhiệm vụ Ride có điều kiện và xử lý xung đột mơ hồ.
