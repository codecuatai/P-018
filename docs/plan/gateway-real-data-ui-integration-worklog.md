# Gateway, giao diện và dữ liệu catalog — worklog

Ngày cập nhật: 2026-08-13  
Trạng thái: **source, catalog và runtime đã hoàn thành; live E2E còn chặn bởi credential `.env` chưa được cấp cho test, và việc rotate provider key cần operator thực hiện**

## 1. Mục tiêu

Luồng cần hoàn thiện:

~~~text
Web
  -> public API Gateway
  -> Agent tạo SemanticTurn/PlanningDecision typed
  -> Gateway kiểm tra policy và điều phối
  -> Restaurant/Food/Healthcare/Ride
  -> PostgreSQL thuộc từng domain
  -> Gateway lọc response public
  -> Web hiển thị dữ liệu authoritative
~~~

Yêu cầu cuối:

- Web chỉ gọi Gateway và dùng đúng URL của stack hiện tại.
- Agent hiểu ngôn ngữ, tạo kế hoạch typed nhưng không gọi database/domain.
- Gateway dùng slot typed, không tự phân tích lại nguyên câu hội thoại.
- Domain không phụ thuộc Gemini và không tự thực hiện NLP.
- CSV catalog được import thật bằng migration/seed chính thức.
- UI hiển thị dữ liệu do domain trả về, không coi fixture là dữ liệu thật.
- Unit, contract, build và live E2E đều pass.

## 2. Hiện trạng đã kiểm chứng

### 2.1. Transport đã nối

Gateway, Agent, bốn domain và PostgreSQL đã từng healthy. Log có request thật
từ Gateway tới Agent, Ride và Restaurant. Lỗi còn lại nằm ở semantics, cấu hình
runtime và catalog, không đơn thuần là thiếu kết nối mạng.

### 2.2. Có sự lệch env file

Web đang trỏ VITE_API_URL=http://localhost:3000 và Gateway health trả 200.
Container đang chạy được tạo từ .env, trong khi một số lệnh kiểm tra trước đó
dùng .env.example. Credential trong container không khớp credential demo của
.env.example.

Mọi lệnh live tiếp theo phải dùng cùng một file .env đã tạo stack. Không đọc,
in hoặc commit nội dung .env.

### 2.3. CSV chưa được import vào database

| Domain | CSV trong repo | PostgreSQL trước sửa |
|---|---:|---:|
| Food restaurant | 239 | 3 |
| Food menu item | 17.357 | 4 |
| Healthcare facility | 3 | 0 |
| Healthcare department | 70 | 20 |
| Healthcare doctor | 208 | 21 |
| Restaurant | 1.307 | 4 |

Kết luận: image đã chứa CSV nhưng launcher chưa gọi importer, nên UI chỉ nhận
catalog demo rất nhỏ.

### 2.4. Restaurant từng vi phạm boundary

Restaurant từng nhận nguyên câu người dùng qua query, tự gọi Gemini để parse
location/cuisine/budget và log URL provider khi lỗi. Điều này vi phạm
services/AGENTS.md và tạo nguồn NLP ngoài Agent.

Một credential provider đã xuất hiện trong runtime log. Không ghi credential
vào worklog. Việc vận hành bắt buộc: thu hồi/rotate khóa đã lộ.

## 3. Công việc đã thực hiện

### 3.1. Migration Healthcare catalog

Đã cập nhật scripts/migrate.ps1 và scripts/migrate.sh để chạy migration:

~~~text
services/healthcare-service/migrations/003_healthcare_provider_catalog.sql
~~~

Chưa chạy live lại sau thay đổi.

### 3.2. Nối importer vào seed chuẩn

Đã cập nhật scripts/seed.ps1 và scripts/seed.sh theo thứ tự:

1. Seed Food deterministic.
2. Chạy seeds.import_food_csv.
3. Seed Restaurant deterministic.
4. Chạy seeds.import_restaurant_csv.
5. Seed Healthcare deterministic.
6. Chạy seeds.import_healthcare_csv.

Importer phải additive/upsert và không xóa order, reservation, appointment,
hold, event hoặc idempotency evidence.

### 3.3. Restaurant CSV importer

Đã tạo services/restaurant-service/seeds/import_restaurant_csv.py.

Hành vi:

- Đọc CSV UTF-8 BOM-safe.
- Tạo stable ID từ source_id.
- Upsert tên, địa chỉ, cuisine, budget, rating, description và image URL.
- Chỉ tạo bàn mặc định nếu nhà hàng chưa có bàn.
- Upsert giờ mở cửa theo weekday.
- Không xóa reservation/hold/event/idempotency record.

Đã cập nhật Restaurant Dockerfile để copy CSV vào
/app/import-data/restaurants.csv và cập nhật seeds/README.md.

Importer chưa có unit test riêng và chưa chạy trên image mới.

### 3.4. Loại Gemini khỏi Restaurant runtime

Đã sửa trong working tree:

- docker-compose.yml: bỏ GEMINI_API_KEY khỏi restaurant-service.
- Restaurant application: search chính chỉ dùng typed filters.
- Restaurant API: không nhận raw query.
- Restaurant repository: bỏ raw-query fuzzy filter.
- Gateway Restaurant client: không gửi query.

Cần test để chắc code LLM chết đã bị loại hoàn toàn.

### 3.5. Typed Restaurant preference

Đã sửa:

- Agent contract thêm cuisine_type và budget_range.
- Agent deterministic path ánh xạ cuisine sang korean, japanese, italian,
  french, thai, indian, vietnamese.
- Agent ánh xạ price preference sang $, $$, $$$.
- Gateway lấy location/cuisine_type/budget_range từ typed task.
- Gateway gửi ba filter xuống restaurant.search.
- Restaurant repository thêm alias VinUni cho Gia Lâm/Hà Nội.

Điểm cần kiểm tra: location parser có thể lấy dính phần cuisine sau cụm “ở”.

## 4. Công việc đang dở

### P0 — Hoàn thiện source

- [ ] Gỡ httpx khỏi production dependency Restaurant nếu không còn runtime
  import; giữ dev dependency cho test.
- [ ] Thêm Agent test cho câu “Tìm nhà hàng món Hàn giá vừa phải ở VinUni”:
  location, cuisine_type=korean và budget_range=$$.
- [ ] Thêm Restaurant API/repository test cho typed cuisine filter.
- [ ] Thêm Gateway test xác nhận restaurant.search có typed filters, không có
  query và không có raw message.
- [ ] Thêm test importer Restaurant: insert, upsert lần hai, không nhân đôi
  table/opening hour và giữ reservation.
- [ ] Chạy Python compile và Gateway TypeScript lint/build.

### P0 — Build và cập nhật stack

1. Dùng đúng env file .env.
2. Build các image thay đổi:

~~~powershell
docker compose --env-file .env build agent-service api-gateway restaurant-service food-service healthcare-service
~~~

3. Recreate service, không xóa volume:

~~~powershell
docker compose --env-file .env up -d --no-deps agent-service api-gateway restaurant-service food-service healthcare-service
~~~

4. Chạy migration và importer:

~~~powershell
./scripts/migrate.ps1 .env
./scripts/seed.ps1 .env
~~~

Không dùng docker compose down -v.

### P0 — Xác minh catalog

Food:

~~~powershell
docker compose --env-file .env exec -T postgres psql -U food_user -d xone_food -Atc "SELECT record_type || '=' || count(*) FROM food_catalog GROUP BY record_type ORDER BY record_type;"
~~~

Healthcare:

~~~powershell
docker compose --env-file .env exec -T postgres psql -U healthcare_user -d xone_healthcare -Atc "SELECT 'facilities='||count(*) FROM healthcare_facilities UNION ALL SELECT 'departments='||count(*) FROM departments UNION ALL SELECT 'doctors='||count(*) FROM doctors UNION ALL SELECT 'slots='||count(*) FROM time_slots;"
~~~

Restaurant:

~~~powershell
docker compose --env-file .env exec -T postgres psql -U restaurant_user -d xone_restaurant -Atc "SELECT 'restaurants='||count(*) FROM restaurants UNION ALL SELECT 'tables='||count(*) FROM restaurant_tables;"
~~~

Tiêu chí:

- Food có khoảng 239 restaurant và 17.357 menu item cộng fixture không xung đột.
- Healthcare có 3 facility, khoảng 70 department và 208 doctor.
- Restaurant có khoảng 1.307 catalog row cộng fixture ID khác.
- Chạy import lần hai không tăng số dòng ngoài dự kiến.

### P0 — Live flow và UI

- [ ] Xác minh Web vẫn trỏ localhost:3000.
- [ ] Đăng nhập bằng credential thuộc .env; không in credential.
- [ ] Test trên UI:
  1. Tìm nhà hàng món Hàn giá vừa phải ở VinUni.
  2. Tìm món phở gần VinUni.
  3. Tìm lịch khám tim mạch.
  4. Chọn Restaurant.
  5. Chọn Healthcare slot.
  6. Đi qua hai bước confirmation bắt buộc.
- [ ] Đối chiếu name/address/price UI với response domain/database.
- [ ] Chạy live E2E:

~~~powershell
$env:E2E_GATEWAY_URL = "http://localhost:3000"
python -m pytest tests/e2e/test_unified_assistant.py -q
~~~

### P1 — UI phản ánh catalog tốt hơn

- [ ] Hiển thị cuisine và rating Restaurant đồng thời.
- [ ] Chỉ thêm image khi Gateway sanitizer và OpenAPI public cho phép.
- [ ] Hiển thị facility Healthcare ngay ở option.
- [ ] Empty-state rõ ràng khi typed filter không có kết quả.
- [ ] Phân biệt field null với dữ liệu “đang cập nhật”.
- [ ] Mọi field public mới phải cập nhật OpenAPI, sanitizer, Web type,
  component và contract test cùng lúc.

## 5. Bộ test bắt buộc

### Agent

~~~powershell
Set-Location apps/agent-service
python -m pytest -q
python -m compileall -q src
python -m ruff check src tests
~~~

Nếu Ruff chưa cài phải ghi rõ not run, không ghi pass.

### Gateway và Web

~~~powershell
Set-Location apps/api-gateway
corepack pnpm lint
corepack pnpm test
corepack pnpm build
Set-Location ../web
corepack pnpm build
~~~

### Domain

~~~powershell
Set-Location services/restaurant-service
python -m pytest -q
Set-Location ../food-service
python -m pytest -q
Set-Location ../healthcare-service
python -m pytest -q
Set-Location ../ride-service
python -m pytest -q
~~~

### Root và E2E

~~~powershell
Set-Location "F:\E\VinUni\P-018"
python scripts/validate-env-config.py
docker compose --env-file .env config --quiet
$env:E2E_GATEWAY_URL = "http://localhost:3000"
python -m pytest tests/e2e -q
~~~

## 6. Tiêu chí hoàn thành

- [ ] Không còn provider call trong domain services.
- [ ] Không còn raw conversation query truyền xuống Restaurant.
- [ ] Agent typed slots khớp filter domain.
- [ ] Importer chạy idempotent hai lần.
- [ ] DB count chứng minh CSV đã được nạp.
- [ ] Web hiển thị option từ DB qua Gateway.
- [ ] Confirmation/idempotency boundary không đổi.
- [ ] Full unit/contract/build pass.
- [ ] Live E2E pass và không skip.
- [ ] Log không chứa secret/provider key.
- [ ] Khóa từng bị lộ đã được rotate.
- [ ] Kiểm tra lại git status, không có build artifact ngoài ý muốn.

## 7. Rủi ro và lưu ý

- Working tree có nhiều thay đổi đã stage từ trước và thay đổi mới chưa stage
  (trạng thái MM). Không reset/checkout vì có thể mất công việc của người dùng.
- Không dùng .env.example để điều khiển stack đã tạo bằng .env.
- Không chạy crawler trong launcher. Launcher chỉ import snapshot CSV đã kiểm
  vào repo; crawler là tác vụ network không xác định.
- CSV “dữ liệu thật” là snapshot catalog, không phải dữ liệu live. Trạng thái
  mở cửa, tọa độ hoặc giá thiếu có thể approximate và phải mô tả trung thực.
- Health check xanh không chứng minh dữ liệu thống nhất; cần DB count, public
  response và E2E.

## 8. Bằng chứng thực thi — 2026-08-13

### Đã hoàn thành

- Restaurant runtime không còn nhận `query`, không gọi Gemini/provider và không
  nhận `GEMINI_API_KEY` từ Compose. `httpx` được bỏ khỏi production dependency;
  chỉ còn dev dependency cho `TestClient`.
- Agent xuất `location`, `cuisine_type`, `budget_range` typed; Gateway chỉ dùng
  ba slot này để gọi `restaurant.search`. Regression test xác nhận raw message
  và `query` không thể được truyền xuống domain.
- Restaurant importer được test insert/upsert hai lần, không nhân đôi table/
  opening-hour, và giữ reservation tồn tại trước đó.
- UI Restaurant hiển thị cuisine, rating và empty-state chính xác từ Gateway.
  UI Healthcare hiển thị facility do domain trả về; Gateway sanitizer, Web type
  và OpenAPI `HealthcareOption` được cập nhật đồng thời.
- Đã build image Agent/Gateway/Restaurant/Food/Healthcare, recreate stack mà
  không xóa volume, chạy migration additive và seed/importer bằng `.env`.
  Toàn bộ 7 container healthy; `GET http://localhost:3000/health/ready` trả 200;
  Web dev server tại 5173 trỏ `http://localhost:3000`.

### Kiểm chứng catalog PostgreSQL

Sau lần import đầu và lần seed/import thứ hai, count không đổi:

| Domain | Count đã xác minh |
| --- | --- |
| Food | 242 restaurant, 17.361 menu item, 1 address, 2 voucher |
| Healthcare | 3 facility, 91 department, 229 doctor, 916 slot |
| Restaurant | 1.311 restaurant, 6.555 table, 9.177 opening-hour |

Lần Restaurant import thứ hai báo `inserted=0`, `updated=1307`; các count giữ
nguyên, chứng minh upsert không tạo bản ghi catalog trùng.

### Test đã chạy

- Agent: `116 passed`; `python -m compileall -q src` pass.
- Restaurant: `21 passed, 1 skipped`.
- Food: `22 passed, 3 skipped`.
- Healthcare: `21 passed, 1 skipped`.
- Ride: `10 passed`.
- Gateway: `61 passed, 5 skipped`; `pnpm lint` và `pnpm build` pass.
- Web: `pnpm build` pass.
- `python scripts/validate-env-config.py` pass (81 root variables, 77 Compose
  variables); `docker compose --env-file .env config --quiet` và
  `docker compose --env-file .env.example config --quiet` pass.
- Ruff: **not run** vì Python local không cài module `ruff`; không ghi nhận pass.

### Việc cần operator hoàn tất

- Live `tests/e2e/test_unified_assistant.py` đã chạy với Gateway thật nhưng
  `13 failed` ngay ở `POST /api/v1/auth/login` (`401`). Test dùng credential demo
  mặc định, còn stack `.env` dùng credential khác. Không đọc/in credential để
  vượt qua boundary bí mật. Cần truyền credential test hợp lệ qua biến E2E được
  hỗ trợ hoặc chạy lại test sau khi đồng bộ fixture với `.env`.
- Credential provider từng xuất hiện trong runtime log trước đó phải được
  operator thu hồi/rotate. Đây là thay đổi secret ngoài phạm vi source patch;
  không được coi là hoàn thành chỉ từ code.

## 9. Generalized nearby-food and failed Ride-confirmation correction — 2026-08-13

### Root cause

- Food follow-up state dropped typed search preferences at the Gateway → Food
  Agent handoff. A short location reply could therefore become a generic Food
  response instead of a filtered catalog search.
- Landmark-to-district resolution was initially considered as an application
  rule. That would not scale as catalog coverage grows, so it was replaced with
  a Food-owned catalog record rather than a location-specific code branch.
- A final Ride action error previously marked only the execution receipt; the
  conversation state could retain the confirmation action for later messages.

### Implemented

- Gateway preserves only typed user preferences (`dish_query`, location,
  category, budget, delivery preference) when invoking the Food Agent. It does
  not create an address, ID, quote, or order.
- Core Agent accepts a concise proper-name location reply only while continuing
  one existing task; explicit destination phrases are parsed generically. This
  is tested with the synthetic landmark `North Campus`, not a product-specific
  place name.
- Food migration `006_food_location_aliases.sql` adds the owned
  `location_alias` catalog type. `food_location_aliases.csv` and the existing
  idempotent importer map public landmark aliases to source-catalog districts.
  The repository resolver reads those records; it contains no landmark-specific
  mapping. New coverage is a seed-data change.
- Food search returns a deterministic bounded result set (default 20, max 50).
  When an exact dish has no result in a supplied area, Agent performs one extra
  bounded read-only nearby search and explicitly identifies its results as
  alternatives.
- A final failed Ride action now persists `FAILED`, removes the action from the
  conversation state, writes a safe failure card, and records `FAILED_FINAL`.
  Failed/blocked tasks are excluded from automatic follow-up; an explicit new
  Ride request begins a new task.

### Checks run for this correction

- Food: `python -m pytest tests/test_food_service.py tests/test_config.py
  tests/test_contract_parity.py -q` → **13 passed**; `compileall src seeds`
  passed.
- Agent: `python -m pytest tests/test_agents/test_assistant_graph.py
  tests/test_agents/test_intent_reconciliation.py tests/test_agents/test_hardening.py -q`
  → **35 passed**; `compileall src` passed.
- Gateway: `corepack.cmd pnpm test -- --runInBand test/assistant.spec.ts` →
  **21 passed**, including the persisted failed-Ride-action regression;
  `corepack.cmd pnpm build` passed.
- `git diff --check` passed. Docker was deliberately not built or restarted in
  this correction cycle; live authenticated E2E remains an operator follow-up.
