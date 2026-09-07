# Hướng Dẫn Phát Triển Cục Bộ (Local Development)

Toàn bộ ngăn xếp (stack) cục bộ chỉ sử dụng duy nhất một tệp nội suy cho Docker Compose: tệp gốc `/.env`. Tuyệt đối không sao chép các khóa bí mật (secret) từ tệp gốc vào các tệp của ứng dụng hoặc service con.

## Chạy Toàn Bộ Stack (Complete Stack)

Trên Windows PowerShell:

```powershell
./scripts/start-all.ps1
# Tùy chọn: nạp dữ liệu mẫu demo tất định cục bộ
./scripts/start-all.ps1 -SeedDemo
```

Trên Linux / macOS:

```bash
./scripts/start-all.sh
# Tùy chọn: nạp dữ liệu mẫu demo tất định cục bộ
./scripts/start-all.sh --seed-demo
```

Bộ khởi chạy chỉ sao chép tệp gốc `.env.example` thành `.env` khi tệp gốc `.env` chưa tồn tại; nó không bao giờ ghi đè hoặc can thiệp vào các tệp cấp service. Bộ khởi chạy sẽ validate môi trường, khởi động Docker Compose, chờ healthcheck của các container, chạy các migration thuộc sở hữu của từng service, sau đó xác minh tính sẵn sàng của Gateway (`/health/ready`) và endpoint sức khỏe của Next.js Web (`/api/health`). Các lần chạy thông thường không tự động nạp seed hoặc reset dữ liệu.

Tùy chọn `-SeedDemo` / `--seed-demo` sử dụng job `catalog-importer` trong Compose (nhờ đó máy chủ triển khai không cần cài đặt Python) để import các danh mục tĩnh có phiên bản của Food, Restaurant và Healthcare; tạo các khung giờ khám bệnh tương lai cho Healthcare cùng liên kết bệnh nhân demo khi demo auth được bật, và bổ sung tài xế cho Ride. Quy trình triển khai tự động gọi cùng một cơ chế seed bổ sung và kiểm tra xác minh; người vận hành không cần chạy lệnh seed thủ công sau khi deploy. Nguồn dữ liệu danh mục trong thư mục `data/` không bao giờ chứa tài khoản người dùng, cuộc hội thoại, đơn đặt chỗ, lịch hẹn hay dữ liệu thanh toán nhạy cảm. Hãy kiểm tra và thay thế các giá trị mẫu trước khi khởi động.

Các tệp `.env` cũ cần được đối soát thủ công vì quy trình thiết lập luôn ưu tiên bảo toàn các cấu hình hiện có của người dùng.

Để xác minh mẫu cấu hình hoặc kiểm tra stack dùng một lần, PowerShell hỗ trợ cú pháp `./scripts/start-all.ps1 -EnvFile .env.example`; việc sử dụng cục bộ thông thường vẫn dùng file gốc `.env`. Kiểm tra tính hợp lệ của cấu hình mà không làm lộ giá trị bí mật bằng lệnh:

```powershell
python scripts/quality/validate-env-config.py
docker compose --env-file .env.example config --quiet
```

## Phát Triển Từng Service Riêng Lẻ Và Ứng Dụng Web

Các tệp `.env.example` ở cấp từng service là tài liệu tham khảo tùy chọn cho việc chạy service bên ngoài Compose. Chúng chỉ chứa các biến thuộc phạm vi của riêng service đó. Hãy truyền các biến này qua biến môi trường shell, cấu hình IDE hoặc lệnh Docker rõ ràng cho service; không sao chép bí mật chéo giữa các service.

Chạy ứng dụng Web Next.js App Router độc lập:

```powershell
corepack pnpm --dir apps/web install --frozen-lockfile
corepack pnpm --dir apps/web dev
```

Đối với lần chạy Web độc lập đó, hãy tạo tệp `apps/web/.env.local` chỉ chứa `NEXT_PUBLIC_API_URL` và các biến trang trí tùy chọn như `NEXT_PUBLIC_HERO_VIDEO_URL` / `NEXT_PUBLIC_HERO_POSTER_URL`. Toàn bộ giá trị có tiền tố `NEXT_PUBLIC_*` đều hiển thị công khai trên trình duyệt, do đó tuyệt đối không được chứa thông tin bí mật. Web gọi trực tiếp Gateway công khai, chỉ lưu access token trong bộ nhớ RAM và không bao giờ tự tạo các card dữ liệu nghiệp vụ giả lập trên trình duyệt.

Khi chạy các service thủ công, hãy áp dụng các migration và dữ liệu seed tất định thuộc quyền sở hữu một cách tường minh:

```powershell
./scripts/migrate.ps1 .env.example
./scripts/seed.ps1 .env.example
```

Các helper này luôn bảo toàn volume của PostgreSQL và không thực hiện thao tác reset có tính hủy hoại.

## Quy Trình Chạy Trực Tiếp Qua Terminal Cục Bộ (Direct Local-Terminal)

Quy trình ứng viên phát hành (release-candidate) hỗ trợ chạy trực tiếp 7 tiến trình ứng dụng trên máy host và chỉ sử dụng container PostgreSQL làm hạ tầng cơ sở dữ liệu:

```powershell
./scripts/local-dev.ps1 -EnvFile .env.example -WaitSeconds 90
./scripts/local-health.ps1
./scripts/seed-local.ps1 -EnvFile .env.example
./scripts/local-acceptance.ps1 -EnvFile .env.example
./scripts/local-stop.ps1
```

Script `local-dev.ps1` kiểm tra môi trường, cổng kết nối PostgreSQL, khởi động Gateway, Agent, Food, Ride, Restaurant, Healthcare và Web trong các tiến trình PowerShell riêng biệt, chỉ lưu ID của các tiến trình đó vào tệp đã được gitignore `.local-runtime/processes.json`, và chờ cho `localhost:3000` cùng `localhost:5173` phản hồi. Script không bao giờ tắt các tiến trình không liên quan và `local-stop.ps1` vẫn giữ container PostgreSQL tiếp tục chạy. Chỉ thêm cờ `-Migrate` khi cần chạy migration rõ ràng. Script `seed-local.ps1` có tính bổ sung (additive) và bảo toàn các danh mục đã import, các đơn đặt và metadata tập dữ liệu; `demo-reset.ps1` mặc định chạy ở chế độ dry-run và bắt buộc phải có `-ConfirmReset` khi muốn reset dữ liệu động của actor.

Script `local-health.ps1` hỗ trợ tự động nhận diện môi trường runtime (`-Runtime Auto|Local|Compose`, với bí danh `Host`/`Docker`). Ở chế độ Compose, nó kiểm tra các endpoint công khai của Gateway/Web bằng các cổng động từ `.env`, xác minh các service domain nội bộ qua trạng thái container, và kết thúc bằng việc kiểm tra Gateway `/health/ready` để phát hiện trường hợp Gateway không thể kết nối tới các domain service. Ở chế độ Local, script kiểm tra endpoint HTTP health của cả 7 service và kiểm tra metadata PID trong `.local-runtime/processes.json`. Cơ chế tự động nhận diện chỉ công nhận runtime tiến trình trực tiếp khi PID đã lưu còn sống **và** cổng tương ứng đang lắng nghe, tránh tình trạng tệp `processes.json` cũ che lấp stack Compose đang chạy. Khi không có runtime nào hoạt động, script sẽ xuất ra hướng dẫn cụ thể thay vì báo lỗi giả. Truyền `-EnvFile` để chỉ định cấu hình môi trường khác mặc định. Logic tra cứu cổng/giá trị chung, nhận diện container Compose và kiểm tra tiến trình nằm trong `scripts/_common.ps1`, được cả `local-health.ps1` và `local-acceptance.ps1` dot-source.

## Nghiệm Thu Liên Dịch Vụ Với Compose (Cross-service Acceptance)

Script `local-acceptance.ps1` chạy bộ kiểm thử liên dịch vụ trong `tests/e2e` như một bước bắt buộc. Bộ kiểm thử này điều khiển Gateway thực tế cùng tất cả các domain service, đồng thời gọi lệnh `docker compose exec`/`restart`, do đó nó yêu cầu runtime Compose thay vì runtime tiến trình trực tiếp:

```powershell
./scripts/start-all.ps1
./scripts/local-acceptance.ps1 -EnvFile .env.example
```

Bước này sẽ báo lỗi (throw) ngay khi có ít hơn 7 container ứng dụng đang chạy thay vì âm thầm bỏ qua. Bạn cũng có thể chạy bộ kiểm thử này độc lập:

```powershell
$env:E2E_GATEWAY_URL = "http://localhost:3000"
corepack pnpm test:e2e:crossservice   # hoặc: python -m pytest tests/e2e -q
```

Các biến `E2E_GATEWAY_URL`, `E2E_COMPOSE_PROJECT_NAME`, `E2E_COMPOSE_ENV_FILE`, `E2E_DEMO_EMAIL` và `E2E_DEMO_PASSWORD` được trích xuất tự động từ `-EnvFile` của acceptance, và `E2E_REQUIRE_GATEWAY=1` biến việc thiếu URL Gateway thành lỗi sử dụng rõ ràng thay vì âm thầm bỏ qua toàn bộ. Cờ `-SkipCrossServiceE2E` có sẵn nhưng sẽ in ra dòng trạng thái `UNVERIFIED` minh bạch để một lượt chạy chưa đầy đủ không bao giờ bị báo cáo sai là đã nghiệm thu hoàn toàn. Lưu ý rằng script `test:e2e:crossservice` ở root là bộ kiểm thử Python Compose; bộ kiểm thử trình duyệt Playwright là `pnpm --dir apps/web test:e2e`.

Để phục vụ nghiệm thu trình duyệt cục bộ, `.env.example` bật cơ chế fallback geocode tất định có dán nhãn và giữ nguyên `RIDE_TRACKING_TIME_SCALE=1`. Lượt chạy test/demo dùng một lần có thể ghi đè tỉ lệ thời gian Ride (ví dụ `60`). Cả hai cấu hình này đều bị từ chối hoặc giới hạn nghiêm ngặt trên môi trường production; cơ chế fallback luôn được dán nhãn `deterministic-local-demo` và tuyệt đối không có thẩm quyền tạo đơn đặt chuyến.

## Trình Quản Lý Gói (Package Manager)

Workspace gốc, Gateway và Next.js Web sử dụng `pnpm` cùng tệp khóa gốc `pnpm-lock.yaml`; CI và Docker sử dụng chế độ cài đặt với lockfile đóng băng (`--frozen-lockfile`). Tệp khóa npm cũ của Web và cấu hình Vite đã được loại bỏ sau khi chuyển đổi sang App Router. Ứng dụng mobile Expo giữ nguyên.
