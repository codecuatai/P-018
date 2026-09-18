# Kế hoạch tích hợp MCP cho Provider — X-One P-018

> Ngày lập: 2026-09-09 | Phạm vi: cả 4 service (ride, restaurant, food, healthcare) | Hướng: hai chiều (X-One vừa làm MCP Server, vừa làm MCP Client) | Vận chuyển: Streamable HTTP | Trạng thái: plan chờ triển khai

## 0. Tóm tắt một đoạn

Dựng một lớp MCP chuẩn trên `api-gateway` để provider nhỏ chỉ cần API Key là cắm AI của họ (Claude Desktop, Cursor, bot nội bộ) vào X-One để quản lý menu, chuyến xe, lịch khám bằng ngôn ngữ tự nhiên; đồng thời cho `agent-service` đóng vai MCP Client để gọi ra MCP Server của đối tác lớn (chuỗi nhà hàng, bệnh viện) mà không phải viết adapter riêng từng nhà. Toàn bộ tool MCP ánh xạ 1-1 sang REST hiện có (`/api/v1/provider/services/*`, `/api/v1/service-actions/*`, `/api/v1/services/*`), tái dùng AuthGuard JWT + phân quyền `provider_type` + rate-limit + audit + Idempotency-Key đã có, không phá vỡ 4 role hiện tại.

## 1. Mục tiêu và phi mục tiêu

### 1.1 Mục tiêu
- Provider tự phục vụ: lấy API Key trong Cổng đối tác (`/app/provider`), dán vào Claude Desktop/Cursor là dùng được ngay, không cần đọc tài liệu REST dài.
- Chuẩn hóa 4 domain thành ~20 tool MCP có schema rõ ràng, tên tiếng Anh snake_case + mô tả song ngữ Việt/Anh.
- Agent X-One gọi được tool của đối tác ngoài qua MCP Client (ví dụ hỏi lịch khám trực tiếp từ MCP của bệnh viện).
- Bảo mật giữ nguyên: chỉ role `provider` được gọi tool ghi; provider thường bị giới hạn domain theo `provider_type`, chỉ master (`provider@xone.local` / `tenant_id=partner-xone-01`) được quản trị đa domain.
- Quan sát được: mọi cuộc gọi MCP đều có `correlationId`, audit log, rate-limit riêng.

### 1.2 Phi mục tiêu (đợt này không làm)
- Không thay thế REST hiện tại, không đổi hợp đồng với web/mobile.
- Không làm thanh toán qua MCP trong giai đoạn 1 (chỉ đọc + quản trị catalog + cập nhật trạng thái đơn/chuyến đã có confirmation).
- Không làm MCP qua stdio; chỉ Streamable HTTP để deploy VPS production hiện tại.

## 2. Kiến trúc tổng thể

```
[AI của provider: Claude Desktop / Cursor / bot quán]
        |  Streamable HTTP + Bearer API Key (MCP)
        v
[X-One MCP Server = McpModule trong api-gateway :3000/mcp]
        |  gọi nội bộ ServiceHubService, ProviderOfferingsStore,
        |  RideClient / FoodClient / RestaurantClient / HealthcareClient
        v
[4 microservice: ride:8001, restaurant:8002, healthcare:8003, food:8004]

[X-One agent-service (MCP Client)]
        |  Streamable HTTP + API Key của đối tác ngoài
        v
[MCP Server của đối tác lớn: bệnh viện / chuỗi nhà hàng]
```

### 2.1 Chiều Server (X-One phục vụ provider)
- Thêm `McpModule` vào `apps/api-gateway/src/app.module.ts`, mount tại `POST /mcp` (JSON-RPC) + `GET /mcp` (SSE stream theo chuẩn Streamable HTTP) + `DELETE /mcp` (đóng session).
- `McpAuthGuard` mới: chấp nhận 2 loại credential là JWT provider hiện tại (Bearer access_token) và API Key dài hạn của provider (Bearer `xone_mcp_...`, tra bảng `api_key_records` với `provider='mcp'`). Sau xác thực, gắn `AuthUser` giả lập để tái dùng `assertProvider` hiện có.
- `McpToolRegistry`: đăng ký tool theo domain, kiểm tra quyền domain y hệt logic master/scope trong `provider-services.controller.ts`.
- Session: `Mcp-Session-Id` header theo spec Streamable HTTP; lưu memory + Redis sau này, giai đoạn 1 dùng Map trong RAM kèm TTL.

### 2.2 Chiều Client (agent-service gọi ra ngoài)
- Thêm package `apps/agent-service/services/mcp_client/` dùng `httpx` + JSON-RPC: `initialize`, `tools/list` (cache 10 phút), `tools/call`.
- Bảng cấu hình mới `mcp_provider_configs(provider_id, mcp_url, api_key_ref, enabled, allowed_tools)` do admin/manager quản trị.
- Agent chỉ gọi tool ngoài khi intent khớp (đặt bàn chuỗi A, hỏi lịch khám viện B); kết quả ngoài được gắn nhãn `source: external-mcp` để UI hiển thị rõ.

## 3. Danh mục tool MCP giai đoạn 1 (20 tool, cả 4 service)

Quy ước tên: `<domain>.<hành_động>`. Tất cả tool ghi yêu cầu thêm `Idempotency-Key` (client tự sinh UUID nếu AI không gửi).

### 3.1 Hồ sơ provider (3 tool, dùng chung)
- `provider.get_profile` — tương đương `GET /api/v1/provider/services/profile`.
- `provider.update_profile` — tương đương `PUT .../profile` (business_name, description, address, phone, webhook_url, is_open).
- `provider.list_items` — tương đương `GET .../items?domain=` (domain là ride/food/restaurant/healthcare).

### 3.2 Quản trị catalog (4 tool)
- `catalog.create_item` — tạo món/xe/chuyên khoa (`POST .../items`), kiểm tra domain theo `provider_type`.
- `catalog.update_availability` — bật/tắt món hết hàng (`PATCH .../items/:id/status`).
- `catalog.delete_item` — xóa item (`DELETE .../items/:id`).
- `catalog.search` — tìm kiếm catalog công khai (`GET /api/v1/services/:service?q=`), tool đọc duy nhất mở cho cả customer.

### 3.3 Ride — tài xế (4 tool)
- `ride.list_pending_bookings` — cuốc chờ nhận (bọc `RideClient.listQuotes` + filter trạng thái SEARCHING_DRIVER).
- `ride.accept_booking` — nhận chuyến (bọc `POST /api/v1/service-actions/ride/:id/confirm` với confirmation evidence hiện có).
- `ride.update_trip_status` — cập nhật DRIVER_ASSIGNED → IN_PROGRESS → COMPLETED (bọc `PATCH /api/v1/service-actions/ride/:bookingId/status`, giữ guard chỉ provider).
- `ride.get_tracking` — lấy vị trí/lộ trình (`GET /api/v1/rides/:bookingId/tracking`).

### 3.4 Food + Restaurant — quán ăn (5 tool)
- `food.list_orders` — đơn chờ xác nhận (bọc FoodClient tương ứng).
- `food.confirm_order` / `food.reject_order` — xác nhận/từ chối đơn (giữ Idempotency-Key).
- `restaurant.list_tables` / `restaurant.hold_table` — xem bàn trống và giữ chỗ (bọc RestaurantClient).
- `restaurant.update_open_status` — đóng/mở quán (`is_open` trong profile).

### 3.5 Healthcare — phòng khám (4 tool)
- `healthcare.list_appointments` — lịch hẹn chờ.
- `healthcare.confirm_appointment` / `healthcare.reschedule_appointment` — xác nhận/dời lịch.
- `healthcare.update_slots` — cập nhật khung giờ bác sĩ (bọc HealthcareClient).

Mỗi tool có `inputSchema` JSON Schema chặt: ví dụ `catalog.create_item` bắt buộc `domain enum[ride,food,restaurant,healthcare]`, `name maxLength 200`, `price >= 0`; `ride.update_trip_status` bắt buộc `booking_id` + `status enum 13 trạng thái RideBookingStatus`.

## 4. Thay đổi dữ liệu (migration)

1. `020_core_mcp_provider.sql`:
   - Thêm cột vào `provider_profiles`: `mcp_enabled BOOLEAN DEFAULT false`, `mcp_endpoint_url TEXT` (dùng cho chiều Client: URL MCP của đối tác lớn, nếu có).
   - Bảng `mcp_provider_configs(provider_id UUID PK/FK users(id), mcp_url TEXT NOT NULL, api_key_ref TEXT, enabled BOOLEAN DEFAULT true, allowed_tools TEXT[] DEFAULT '{}', created_at, updated_at)`.
   - Tái dùng bảng `api_key_records` sẵn có cho MCP API Key với `provider='mcp'` (cần mở rộng CHECK constraint hiện tại vốn chỉ cho gemini/trello/geoapify/google_maps/other — thêm `'mcp'`).
2. Seed demo: bật `mcp_enabled=true` cho `provider@xone.local`, tạo 1 API Key demo `xone_mcp_demo_...` cho môi trường dev/test.

## 5. Thay đổi code chi tiết từng file

### 5.1 api-gateway (chiều Server, ~7 file mới + 4 file sửa)
- MỚI `src/modules/mcp/mcp.module.ts` — khai báo McpController, McpService, McpToolRegistry, McpAuthGuard; import AuthModule, ServicesModule.
- MỚI `src/modules/mcp/mcp.controller.ts` — `POST /mcp` xử lý JSON-RPC (initialize, tools/list, tools/call, resources/list tối thiểu), `GET /mcp` mở SSE stream, `DELETE /mcp` hủy session; gắn correlationId middleware hiện có.
- MỚI `src/modules/mcp/mcp.auth.ts` — McpAuthGuard: thử JWT qua AuthService.authenticateAccessToken, fallback tra `api_key_records` theo hash Bearer token; từ chối nếu role != provider (trừ tool đọc công khai).
- MỚI `src/modules/mcp/mcp.registry.ts` — định nghĩa 20 tool + inputSchema + handler ánh xạ sang ServiceHubService/ProviderOfferingsStore/*Client; kiểm tra allowedDomainsMap y hệt provider-services.controller.
- MỚI `src/modules/mcp/mcp.session.ts` — quản lý `Mcp-Session-Id`, Map TTL 30 phút.
- MỚI `src/modules/mcp/dto.ts` — JSON-RPC types (JsonRpcRequest/Response, ToolCallParams).
- MỚI `src/modules/mcp/mcp.controller.spec.ts` — test guard + 3 tool mẫu.
- SỬA `src/app.module.ts` — thêm McpModule vào imports.
- SỬA `src/config/environment.ts` — thêm `MCP_ENABLED` (default true), `MCP_SESSION_TTL_SECONDS` (default 1800), thêm rate-limit entries `mcp.rpc` cho `POST /mcp`.
- SỬA migration CHECK của `api_key_records` để chấp nhận `provider='mcp'`.
- SỬA `apps/api-gateway/Dockerfile` — không cần đổi, vì McpModule nằm trong build hiện tại.

### 5.2 agent-service (chiều Client, ~4 file mới + 2 file sửa)
- MỚI `services/mcp_client/client.py` — AsyncClient httpx: initialize (gửi protocolVersion `2025-06-18`, clientInfo `x-one-agent`), tools/list có cache, tools/call có timeout 15s + retry 1 lần.
- MỚI `services/mcp_client/registry.py` — đọc `mcp_provider_configs` enabled, lọc allowed_tools.
- MỚI `services/mcp_client/router.py` — quyết định khi nào gọi MCP ngoài (intent đặt bàn chuỗi / hỏi lịch viện) và gắn nhãn nguồn.
- MỚI `tests/test_mcp_client.py` — mock MCP Server ngoài bằng httpx MockTransport.
- SỬA `agents/*` (nơi gọi tool hiện tại) — thêm nhánh gọi `mcp_client` khi intent khớp, fallback về service nội bộ khi MCP ngoài lỗi.
- SỬA `Dockerfile`/`requirements` của agent-service — thêm `httpx`, `anyio`.

### 5.3 Web (provider portal + admin, ~3 file sửa + 1 file mới)
- SỬA `features/provider/provider-portal.tsx` — thêm tab "Kết nối MCP": hiển thị nút Tạo API Key, nút Thu hồi, đoạn JSON config để dán vào Claude Desktop (`mcpServers: { x-one: { url, headers: { Authorization } } }`), nút Copy, nút Test kết nối (gọi `tools/list`).
- SỬA `features/admin/admin-dashboard.tsx` — thêm cột quản trị `mcp_enabled` + bảng `mcp_provider_configs` (URL MCP ngoài, bật/tắt, allowed_tools).
- MỚI `app/app/provider/mcp/page.tsx` (hoặc route tương đương) — trang hướng dẫn 3 bước cắm MCP cho chủ quán/phòng khám không rành kỹ thuật.
- SỬA `lib/api-client.ts` — thêm kiểu `role?: customer|provider` đã có, bổ sung hàm gọi `/mcp` test.

### 5.4 Hạ tầng và tài liệu
- SỬA `docker-compose.yml` — không thêm container mới (MCP Server chạy chung gateway :3000); chỉ thêm env `MCP_ENABLED=true`, `MCP_SESSION_TTL_SECONDS=1800` vào service api-gateway.
- SỬA `.env.example` — thêm 2 biến trên + `MCP_DEMO_KEY` cho dev.
- MỚI `docs/api/provider-mcp.md` — tài liệu tool, ví dụ prompt tự nhiên ("hết món phở bò thì tắt đi"), ví dụ config Claude Desktop/Cursor.
- MỚI `packages/provider-mcp/` (tùy chọn giai đoạn 2) — SDK đóng gói sẵn cho provider tự host nếu muốn, không bắt buộc giai đoạn 1.

## 6. Bảo mật

- Xác thực kép: JWT ngắn hạn cho portal web, API Key dài hạn `xone_mcp_<32 ký tự ngẫu nhiên>` lưu dạng SHA-256 hash trong `api_key_records`, chỉ hiển thị 1 lần lúc tạo.
- Phân quyền: tái dùng `assertProvider` + `allowedDomainsMap` (ride_driver→[ride], restaurant_merchant→[food,restaurant], healthcare_doctor→[healthcare], master→all); tool ghi nào cũng kiểm tra lại ở tầng registry, không tin client.
- Chống ghi trùng: mọi tool ghi bắt buộc Idempotency-Key; gateway trả lại kết quả cũ nếu key trùng (tái dùng hạ tầng confirmation evidence của ride).
- Rate-limit riêng: `GATEWAY_PROVIDER_SERVICES_RATE_LIMIT` hiện có + thêm bucket `mcp.rpc` (đề xuất 120 req/phút/provider).
- Audit: mỗi `tools/call` ghi 1 dòng audit với action `MCP_TOOL_CALL`, metadata gồm tool_name, provider_id, domain, correlationId.
- Webhook HMAC hiện có giữ nguyên cho callback chiều ngược; MCP không thay thế webhook.

## 7. Lộ trình triển khai 4 giai đoạn

### Giai đoạn 0 — Chuẩn bị (0.5 ngày)
- Chốt danh mục 20 tool, chốt tên + schema; mở rộng CHECK `api_key_records` với 'mcp'; thêm env mẫu.

### Giai đoạn 1 — MCP Server lõi (2–3 ngày, giá trị lớn nhất)
- Dựng McpModule + 7 tool đọc/ghi cơ bản nhất: get_profile, list_items, create_item, update_availability, ride.list_pending_bookings, food.list_orders, healthcare.list_appointments.
- Trang portal hiển thị API Key + nút test; tài liệu `provider-mcp.md` bản tối thiểu; test tay bằng Claude Desktop trỏ vào gateway dev.

### Giai đoạn 2 — Phủ đủ 4 service (2 ngày)
- Bổ sung 13 tool còn lại (ride accept/status/tracking, food confirm/reject, restaurant tables/hold, healthcare confirm/reschedule/slots).
- Áp domain guard đầy đủ + rate-limit + audit; kiểm thử e2e 4 luồng provider thật.

### Giai đoạn 3 — MCP Client trong agent-service (2 ngày)
- Dựng `mcp_client`, bảng `mcp_provider_configs`, UI admin bật/tắt URL ngoài; router intent; gắn nhãn `external-mcp`; test với 1 MCP Server giả lập.

### Giai đoạn 4 — Cứng hóa và phát hành (1 ngày)
- Pen-test nhẹ (sai key, sai domain, thiếu Idempotency-Key, quá rate-limit), đo latency p95, viết hướng dẫn video/ảnh 3 bước cho chủ quán, seed demo key, deploy production theo pipeline CI/CD hiện tại.

Tổng ước lượng: khoảng 7–8 ngày công cho 1 dev fullstack quen NestJS + Python.

## 8. Kiểm thử

- Unit (gateway jest): guard chấp nhận JWT đúng / từ chối sai role / từ chối sai domain; registry validate schema thiếu trường bắt buộc.
- Unit (agent pytest): client parse initialize/tools-list, cache, timeout, fallback khi MCP ngoài chết.
- Tích hợp: tạo provider demo → tạo API Key → gọi `tools/list` → gọi `catalog.create_item` → kiểm tra DB `provider_service_items` có dòng mới.
- E2E tay: dán config vào Claude Desktop, ra lệnh tự nhiên "tắt món X", "nhận cuốc Y", "đóng quán tối nay" và đối chiếu DB.
- Tương thích: kiểm tra với Claude Desktop mới nhất + Cursor + 1 bot Python dùng `@modelcontextprotocol/sdk`.

## 9. Tiêu chí nghiệm thu

- [ ] Provider tạo/thu hồi API Key trong portal dưới 1 phút, không cần hỗ trợ dev.
- [ ] Claude Desktop liệt kê đủ 20 tool qua `tools/list` với Streamable HTTP, không lỗi CORS/auth.
- [ ] Provider thường không gọi được tool ngoài domain của mình (nhận `DOMAIN_NOT_PERMITTED`).
- [ ] Mọi `tools/call` ghi đều có audit log và tôn trọng Idempotency-Key (gọi trùng không sinh đơn/chuyến trùng).
- [ ] Agent gọi được ít nhất 1 MCP ngoài giả lập và gắn nhãn nguồn đúng.
- [ ] CI/CD hiện tại vẫn xanh, production `/mcp` trả về JSON-RPC hợp lệ, latency p95 < 800ms cho tool đọc.

## 10. Rủi ro và cách giảm

- Rủi ro lộ API Key: giảm bằng chỉ hiện 1 lần, lưu hash, cho thu hồi 1 click, rate-limit riêng, hướng dẫn không dán key lên mạng xã hội.
- Rủi ro AI gọi nhầm tool ghi: giảm bằng tách tool đọc/ghi rõ ràng, mô tả tool nhấn mạnh cần xác nhận, UI portal hiển thị lịch sử gọi MCP để undo (bật lại món, mở lại quán).
- Rủi ro MCP ngoài chậm/chết: giảm bằng timeout 15s + fallback service nội + gắn nhãn nguồn để user biết.
- Rủi ro phình scope: giảm bằng khóa giai đoạn 1 ở 7 tool, không ôm thanh toán.

## 11. Checklist triển khai cho dev nhận việc

1. Tạo migration `020_core_mcp_provider.sql` + chạy thử trên DB dev.
2. Tạo 6 file mới trong `src/modules/mcp/` + đăng ký McpModule vào `app.module.ts`.
3. Thêm env `MCP_ENABLED`, `MCP_SESSION_TTL_SECONDS` vào `environment.ts` + `.env.example` + `docker-compose.yml`.
4. Viết test `mcp.controller.spec.ts`, chạy `pnpm --dir apps/api-gateway test`.
5. Thêm tab MCP trong `provider-portal.tsx`, test tạo key + copy config.
6. Dựng `mcp_client` trong agent-service + test pytest mock.
7. Viết `docs/api/provider-mcp.md`, seed demo key, deploy dev → test Claude Desktop → merge main → chờ CI → kiểm tra production `/mcp`.
