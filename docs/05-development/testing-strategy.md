# Chiến Lược Kiểm Thử (Testing Strategy)

Các bài kiểm thử chứng minh một hành vi duy nhất tại ranh giới sở hữu nó. Unit test sử dụng các adapter tất định và LLM giả lập; không bao giờ gọi trực tiếp Gemini, nhà cung cấp thanh toán thực tế hay hệ thống domain thực tế. Contract test bảo vệ các envelope công khai và ranh giới service dạng typed. Các bài test PostgreSQL chỉ chạy trên cơ sở dữ liệu dùng một lần (disposable target) được cấp phát riêng. Nghiệm thu trình duyệt chỉ được công nhận sau một lượt chạy trình duyệt thực tế.

## Các Kiểm Tra Bắt Buộc Trước Khi Bàn Giao

Chạy các bài kiểm tra phạm vi thay đổi trước khi bàn giao:

```powershell
python scripts/quality/validate-env-config.py
docker compose --env-file .env.example config --quiet
python scripts/database/check-migration-parity.py

corepack pnpm --dir apps/api-gateway install --frozen-lockfile
corepack pnpm --dir apps/api-gateway run lint
corepack pnpm --dir apps/api-gateway test
corepack pnpm --dir apps/api-gateway run build

corepack pnpm --dir apps/web install --frozen-lockfile
corepack pnpm --dir apps/web run lint
corepack pnpm --dir apps/web run typecheck
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web run build
```

Bộ kiểm thử của Web bao phủ: hành vi lưu access-token chỉ trên RAM, một refresh token dùng chung duy nhất cho các request được bảo vệ đồng thời, khôi phục/thất bại của auth-provider, validate dữ liệu đăng ký và hiển thị giao diện khi người dùng giảm chuyển động (reduced-motion). Các bài unit/HTTP test của Gateway bao phủ: chính sách Argon2id, thất bại đăng nhập an toàn (chống dò tài khoản), giới hạn thuật toán và claim JWT từ thư viện chuẩn, thuộc tính cookie, kiểm tra origin, xoay vòng token, thu hồi toàn bộ nhóm phiên khi phát hiện dùng lại, phiên làm việc phân vùng theo actor, đổi và đặt lại mật khẩu.

Đối với việc kiểm tra lưu trữ thực tế của Core/Auth trên PostgreSQL, hãy cung cấp cùng một URL database dùng một lần cho cả hai biến:

```powershell
$env:CORE_TEST_DATABASE_URL = 'postgresql://.../xone_core'
$env:AUTH_TEST_DATABASE_URL = $env:CORE_TEST_DATABASE_URL
corepack pnpm --dir apps/api-gateway test -- --runInBand test/core.postgres.integration.spec.ts test/auth.postgres.integration.spec.ts
```

Bài test Auth PostgreSQL áp dụng các migration Core cần thiết đến `011_core_multi_service_workflows.sql`; sau đó chứng minh việc tạo tài khoản nguyên tử, lưu trữ băm Argon2id, thu hồi phiên khi replay rotation, băm token reset dùng 1 lần và vô hiệu hóa phiên. Bài test này tuyệt đối không được trỏ vào volume dữ liệu của người dùng.

## Tích Hợp Liên Tục (CI)

CI cài đặt các dependency của Gateway và Web thông qua file khóa pnpm đóng băng (`--frozen-lockfile`). Job của Web chạy lint, typecheck, Jest và `next build`. Job PostgreSQL chạy cả hai suite tích hợp Core và Auth trên dịch vụ PostgreSQL tạm thời của GitHub Actions. Quá trình kiểm tra Compose tiến hành build các image của Gateway, Web, Agent và Food.

## Nghiệm Thu Trình Duyệt Và Stack Dùng Một Lần

Tạo một dự án Compose dùng một lần với tên duy nhất; không tái sử dụng hay xóa volume/dự án thông thường của lập trình viên. Chạy các migration thuộc quyền sở hữu, sau đó kiểm tra luồng công khai Web/Gateway: trang landing ở kích thước 320px và màn hình desktop, đăng ký, làm mới token, đăng xuất/đăng nhập, thao tác cài đặt/phiên và chế độ hiển thị giảm chuyển động. Chỉ ghi nhận một bài kiểm tra là **PASS** khi có kết quả quan sát thực tế. Nếu không có môi trường tự động hóa trình duyệt, hãy ghi nhận là **UNVERIFIED**, không được coi là đã đạt.

## Khung Kiểm Thử Playwright

Ứng dụng Web sở hữu một cấu hình Playwright duy nhất tại `apps/web/playwright.config.ts`. Cấu hình sử dụng các dự án Chromium ở các kích thước 375x812, 768x1024 và 1440x1000, tự động khởi động hoặc tái sử dụng dev server của Web, và chỉ lưu trace/ảnh chụp màn hình/video khi có lỗi. 3 tệp kịch bản bao phủ 9 kịch bản:

- `e2e/auth-onboarding.spec.ts`: đăng ký, từ chối onboarding, lưu địa chỉ, duy trì đăng xuất/đăng nhập và từ chối cấp quyền vị trí rõ ràng.
- `e2e/conversations.spec.ts`: tạo/gửi/đổi tên/lưu trữ/bỏ lưu trữ/tải lại/xóa cuộc hội thoại thông qua các tuyến Gateway phân vùng theo actor.
- `e2e/service-flows.spec.ts`: Food, vòng đời chuyến đi Ride kèm 2 bước xác nhận, Restaurant, Healthcare, thành công từng phần kết hợp Healthcare và Ride, và từ chối truy cập chéo người dùng.

Xác minh độc lập không cần mở trình duyệt:

```powershell
corepack pnpm --dir apps/web exec playwright test --list
corepack pnpm --dir apps/web exec tsc --noEmit
```

Lệnh list báo cáo `27 tests (9 scenarios x 3 viewports)`.

## Bằng Chứng Xác Minh Thực Tế - 2026-08-13

- Runtime tiến trình trực tiếp: `local-dev.ps1`, `local-health.ps1`, `seed-local.ps1` bổ sung và dry-run `demo-reset.ps1` đã được thực thi đối chiếu với container PostgreSQL hiện có. Toàn bộ 7 kiểm tra sức khỏe ứng dụng đều đạt `PASS`.
- Bộ kiểm thử trình duyệt nhanh Web: Playwright Chromium chạy tuần tự đạt 27/27 test ở các độ phân giải 375x812, 768x1024 và 1440x1000. Bộ test Product thực tế đạt 2/2, Admin đạt 1/1, và luồng giao dịch thực tế đạt 1/1. Các lỗi trang, lỗi console và request thất bại đều bị coi là lỗi bài test.
- CLI tùy chọn `agent-browser` không được cài đặt; Playwright Chromium được sử dụng làm bằng chứng kiểm thử trình duyệt thực tế. Không suy diễn kết quả đạt chỉ từ danh sách liệt kê test.
- Độ bao phủ giao dịch thực tế kiểm tra Food, theo dõi Ride, Restaurant, Healthcare, lịch sử/đặt lại/phản hồi và thông báo qua Gateway và các domain service mà không dùng mock.
- Kiểm tra hiệu năng khói (performance smoke) cục bộ với 10 mẫu trên mỗi endpoint đọc đã ghi nhận p50, p95 và max cho Gateway health, tìm kiếm Food/Restaurant/Healthcare, lịch sử, dashboard Admin và theo dõi Ride; đăng nhập auth sử dụng 3 mẫu để tránh chạm ngưỡng giới hạn đăng nhập cục bộ.

## Tầng Liên Dịch Vụ Compose — `tests/e2e`

`tests/e2e` là tầng kiểm thử liên dịch vụ: nó điều khiển API Gateway thực tế cùng với Agent, Ride, Restaurant, Healthcare và Food thông qua HTTP, đồng thời can thiệp vào stack bằng `docker compose exec`/`restart` để khẳng định tính bền vững của dữ liệu, xử lý hết hạn giữ chỗ và replay idempotent xuyên suốt quá trình restart Gateway. Do đó, nó **bắt buộc yêu cầu runtime Docker Compose** và không thể chạy trên runtime tiến trình trực tiếp.

Lệnh thực thi là:
```bash
python -m pytest tests/e2e -q
# hoặc từ workspace gốc:
corepack pnpm test:e2e:crossservice
```

Script gốc được đặt tên có chủ ý là `test:e2e:crossservice`, không gọi là `test:e2e` vì `test:e2e` của `apps/web` là bộ kiểm thử trình duyệt Playwright và hai tầng này không được nhầm lẫn trong các script hay CI.

Script `scripts/local-acceptance.ps1` chạy bộ kiểm thử này như một bước bắt buộc. Nó trích xuất `E2E_GATEWAY_URL`, `E2E_COMPOSE_PROJECT_NAME`, `E2E_COMPOSE_ENV_FILE` và tài khoản demo từ tệp môi trường acceptance, đồng thời đặt `E2E_REQUIRE_GATEWAY=1`. Hai cơ chế bảo vệ ngăn chặn việc báo cáo đạt khi chưa chạy: hook `pytest_configure` ở cấp độ bộ test sẽ raise một `UsageError` khi `E2E_REQUIRE_GATEWAY` được đặt mà thiếu URL Gateway, và bước acceptance sẽ báo lỗi ngay khi stack Compose chưa hoàn chỉnh. Cờ `-SkipCrossServiceE2E` có sẵn cho việc chạy từng phần có chủ đích và sẽ in ra dòng `UNVERIFIED` nêu rõ những phần chưa được kiểm tra.

Các fixture dùng chung nằm trong `tests/e2e/_helpers.py` và được import tuyệt đối (`from _helpers import ...`). Thư mục `tests/e2e` không có tệp `__init__.py`, do đó theo chế độ import mặc định `prepend` của pytest, việc import tương đối như `from .conftest import ...` sẽ gây lỗi collection. `_helpers` cũng sở hữu bộ nhớ đệm token truy cập giúp toàn bộ lượt chạy kiểm thử không vượt quá giới hạn rate limit đăng nhập theo IP của Gateway.
