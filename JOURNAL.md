# Weekly Journal — X-One (Team P-018, VinUni AI20K Cohort 3)

> Nhật ký theo tuần: mục tiêu, kết quả, khó khăn, quyết định, kế hoạch.
>
> **Trạng thái file này:** các mục *Mục tiêu*, *Đã hoàn thành*, *Khó khăn* và *Quyết định* dưới đây được dựng lại từ bằng chứng có thật trong repo — lịch sử Git (126 commit, 2026-07-23 → 2026-08-14), [WORKLOG.md](WORKLOG.md), [ADR](docs/adr/README.md) và [current state](docs/architecture/current-state.md). Các mục **Bài học** để trống có chủ đích: đó là phần chủ quan, chỉ thành viên trong đội mới viết được — không suy ra từ code, và không được bịa.
>
> Bản ghi công việc chi tiết theo ngày/theo người nằm ở [WORKLOG.md](WORKLOG.md). File này chỉ tổng hợp theo tuần.

---

## Week 1: 2026-07-23 – 2026-07-29

### Mục tiêu tuần này
- [x] Khởi tạo repository và quy ước làm việc
- [x] Dựng cơ chế log AI usage tự động cho toàn đội
- [x] Thiết lập kỷ luật ghi WORKLOG theo ngày

### Đã hoàn thành
- Initial commit và thiết lập nhánh `develop` làm nhánh tích hợp.
- Hook log AI usage chạy trong `pre-push`: `scripts/log_antigravity.py --auto` + `scripts/submit_log.py`. Xử lý riêng cho Codex và Gemini hook.
- Sửa `log_manual.py` để output an toàn trên Windows (vấn đề encoding console).
- Bổ sung SQLite fallback cho `log_antigravity.py` khi không đọc được transcript.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Hook log không chạy đúng trên Windows (encoding, đường dẫn) | Chuẩn hoá output sang dạng windows-safe; thêm `scripts/_pyrun.cmd` cho môi trường cmd/PowerShell | Log chạy được trên cả Git Bash và PowerShell |
| Mỗi AI tool ghi transcript ở định dạng khác nhau | Viết hook riêng cho Antigravity / Codex / Gemini | Prompt được capture nguyên văn từ disk, không cần AI tự tóm tắt |

### Quyết định
- Log AI là **tự động hoàn toàn**, không gọi tay sau mỗi task. Xem [.agents/rules/ai-log-hook.md](.agents/rules/ai-log-hook.md).

### Bài học
- _(đội tự điền)_

### Kế hoạch tuần sau
- [x] Dựng frontend demo
- [x] Chốt kiến trúc backend

---

## Week 2: 2026-07-30 – 2026-08-05

### Mục tiêu tuần này
- [x] Có UI demo chạy được để trình bày luồng người dùng
- [x] Chốt kiến trúc backend và ghi thành tài liệu + luật cho AI agent

### Đã hoàn thành
- Web frontend React/Vite (`apps/web`) với các luồng UI demo, tài liệu wireframe (`docs/ui_wireframe_flow.md`) và sơ đồ kiến trúc.
- **Bước ngoặt của dự án:** refactor toàn bộ repo sang nền tảng backend-first microservices — chuyển FastAPI agent vào `apps/agent-service`, thêm NestJS Gateway (`apps/api-gateway`), dựng skeleton cho các domain service, Docker Compose + PostgreSQL bootstrap, tài liệu kiến trúc và `AGENTS.md`.
- Thêm Ride service đầu tiên.
- Dọn Dockerfile và `requirements.txt` dư ở root.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| UI demo dùng mock data, không phản ánh backend thật | Đánh dấu rõ là demo, sang tuần 3 thay bằng endpoint thật của Gateway | Web chỉ gọi Gateway công khai, không gọi service nội bộ |
| Thử WebSocket cho realtime timeline (commit *"module medical booking agent và websocket"*) | Bỏ hướng này; chốt REST/JSON đồng bộ | [ADR 0003](docs/adr/0003-synchronous-rest.md) — không có WebSocket/Redis trong stack hiện tại |
| Merge PR Ride gây xung đột, phải revert | `Revert "Merge pull request #26 …"` rồi làm lại trên nền backend-first | Ride service vào lại sạch ở tuần 3 |

### Quyết định
- NestJS Gateway là **biên công khai duy nhất**; client không bao giờ gọi trực tiếp domain service — [ADR 0001](docs/adr/0001-nestjs-central-orchestrator.md).
- Mỗi domain sở hữu một logical database riêng, cấm cross-DB query/FK/shared ORM — [ADR 0002](docs/adr/0002-logical-database-ownership.md).
- Agent **chỉ** phát ra typed tool request, Gateway thực thi mọi side effect — [ADR 0004](docs/adr/0004-one-agent-tool-gateway.md).
- Bỏ hoàn toàn Redis, WebSocket, queue, Kubernetes khỏi phạm vi (ghi trong `AGENTS.md`).

### Bài học
- _(đội tự điền)_

### Kế hoạch tuần sau
- [x] Hoàn thiện 4 domain: Ride, Food, Restaurant, Healthcare
- [x] Nối Web vào backend thật

---

## Week 3: 2026-08-06 – 2026-08-12

### Mục tiêu tuần này
- [x] Tích hợp cục bộ đủ bốn domain qua Gateway
- [x] Thay mock data trong Web bằng endpoint thật
- [x] Chạy pass thu bằng chứng (test, migration, E2E) trước code freeze

### Đã hoàn thành
- Bốn domain service chạy được, mỗi service một logical DB: Ride `8101`, Restaurant `8102`, Healthcare `8103`, Food `8104` — không service nào publish ra host, chỉ Gateway gọi được qua network `xone_internal`.
- Web bỏ mock data, gọi endpoint thật, sync dark theme; lịch sử thanh toán và phiếu xác nhận dịch vụ y tế.
- Restaurant reservation workflow và Food ordering workflow hoàn chỉnh với hai bước xác nhận + idempotency.
- Unified Assistant: một hội thoại duy nhất cho cả bốn domain (`/api/v1/assistant/chat`, `/api/v1/assistant/actions`).
- Pass thu bằng chứng 2026-08-09: base suites Food `22 passed, 3 skipped` / Ride `10 passed` / Restaurant `20 passed, 1 skipped` / Healthcare `21 passed, 1 skipped`; PostgreSQL Food `3/3`, Gateway Core `5/5`; deterministic public E2E `31 passed`; live Gemini demo `4/5`. Chi tiết ở [testing strategy](docs/development/testing-strategy.md).
- Bắt đầu dựng CI: chạy Ruff + pytest cho cả năm service Python, frozen pnpm install cho Gateway, `npm ci` cho Web.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Số lượng test đếm ra không khớp nhau (`21/7/18/18` vs `25/10/21/22`) | Đối chiếu `git ls-files` với disk; phát hiện snapshot `develop.xml` bỏ nội dung 4 file `tests/test_config.py` | Chốt con số đúng `25/10/21/22`, ghi node ID cụ thể vào testing strategy, không sửa test nào |
| PowerShell seed làm hỏng dữ liệu tiếng Việt | Ghi payload UTF-8 trực tiếp vào `psql` thay vì qua native pipeline | Catalog demo tiếng Việt không còn lỗi encoding |
| Postgres port collision trên self-hosted runner | Cấp port ngẫu nhiên cho service container | CI chạy song song không tranh port |
| Advisory `nanoid@3.3.16` (high) qua `vite → postcss` | Phân tích chuỗi phụ thuộc: Vite chỉ chạy trong Docker builder, ảnh cuối là Nginx tĩnh, PostCSS gọi `nanoid(6)` cố định | Kết luận build-only, không exploit được ở runtime; không đổi lockfile trong code freeze |
| Live Gemini không tất định | Tách bạch DETERMINISTIC E2E khỏi LIVE SMOKE; phân loại lỗi theo category A–F | `SKIPPED` live E2E không còn được tính là acceptance evidence |

### Quyết định
- Xác nhận hai bước là bắt buộc cho mọi hành động tài chính: xác nhận chi tiết dịch vụ, rồi xác nhận thanh toán.
- Mọi write có side effect phải mang `Idempotency-Key`, domain service tự enforce.
- Từ vựng trạng thái tài liệu chỉ dùng `implemented` / `skeleton` / `planned` — không ghi "done" cho thứ chưa chạy.

### Bài học
- _(đội tự điền)_

### Kế hoạch tuần sau
- [x] Tối ưu CI cho monorepo
- [x] Tự động deploy staging

---

## Week 4: 2026-08-13 – 2026-08-19 _(đang diễn ra — commit gần nhất 2026-08-14)_

### Mục tiêu tuần này
- [x] CI monorepo nhanh và có path filtering
- [x] Deploy staging tự động từ commit đã test
- [ ] Đóng các khoảng trống tài liệu vs code

### Đã hoàn thành
- CI: matrix song song cho Python service, path filtering theo job, gộp CI và staging deploy vào một workflow (`.github/workflows/ci-cd.yml`).
- CD: push `staging` thành công sẽ deploy đúng commit đã test lên `/opt/xone` qua SSH; Compose build và chạy cả image Web với `/api` làm base URL.
- Web được serve từ container Compose trên `127.0.0.1:8080`; staging Nginx proxy `/` sang Web và `/api/` sang Gateway.
- `perf`: chuyển phần parse query Gemini xuống application service layer.
- Sửa parity migration: bổ sung `003_healthcare_provider_catalog.sql` vào cả `scripts/migrate.ps1` và `scripts/migrate.sh`.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| GitHub billing limit chặn job deploy | Chuyển deploy job sang self-hosted cohort runner | Pipeline deploy chạy được |
| `ubuntu-latest` gây lỗi relocate python venv path | Quay lại self-hosted runner và serialize pipeline để tránh CPU starvation | CI ổn định |
| Lỗi cache `tsc` khi build Gateway | Chạy test trước deploy và sửa cache | Build sạch |
| Context build image Web kéo theo `node_modules` | Loại dependency khỏi image context (`.dockerignore`) | Image nhỏ hơn, build nhanh hơn |
| Migration mới không được đăng ký ở cả hai runner | `scripts/check-migration-parity.py` phát hiện lệch; bổ sung file thiếu | PowerShell và Bash apply cùng một tập migration |

### Quyết định
- Không tuyên bố có production deployment pipeline — chỉ có staging automation; VPS, `.env`, secrets do người vận hành bên ngoài quản lý.

### Bài học
- _(đội tự điền)_

### Kế hoạch tuần sau
- [ ] Viết evaluation harness thật cho `eval/` (hiện mọi metric là `not measured`)
- [ ] Bổ sung contract parity test cho Ride
- [ ] Hoàn thiện `presentation/` (pitch deck + video demo chưa có trong repo)
- [ ] Browser smoke vẫn `UNVERIFIED` — cần chạy và ghi kết quả

---

> **Việc cần người dùng xử lý:** revoke/rotate Stitch API key đã từng bị lộ. Xem [current state](docs/architecture/current-state.md).
