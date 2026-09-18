# Weekly Journal — Team P-018

> Ghi lại mỗi tuần: học được gì, khó khăn gì, quyết định gì, kế hoạch tiếp.

---

## Week 1: 2026-07-23 - 2026-07-26

### Mục tiêu tuần này
- [x] Khởi tạo repository dự án từ template AI20K Agent
- [x] Thiết lập môi trường phát triển, .env và Git pre-push hook
- [x] Cài đặt AI usage logging hook và quy trình PR giữa main/develop/test
- [x] Chuẩn hóa WORKLOG.md và JOURNAL.md

### Đã hoàn thành
- Khởi tạo repository từ template, thêm tài liệu nền (README, docs) và JOURNAL.md (e459dab, 0ffcd10)
- Kiểm thử AI log hook trên Windows PowerShell; sửa output windows-safe và Codex hook logging (ef2b2e2, d805095)
- Thiết lập môi trường .venv/dependencies, cài pre-push hook; tạo branch test/verify-ai-log (8e649b9, b8f7790, 229bc27)
- Cập nhật WORKLOG.md chi tiết theo ngày, giải quyết conflict và chuẩn hóa nội dung (e53ca79, b30f0f2, ce2cc5f, b2f5b04)
- Đồng bộ nhánh và merge các PR #1–#12 giữa test/develop/main

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| AI log hook không chạy đúng trên Windows PowerShell | Sửa output windows-safe, fix Codex hook logging (ef2b2e2, d805095) | Hook logging hoạt động và ghi nhận AI usage |
| Conflict WORKLOG.md khi merge nhiều nhánh song song | Giải quyết merge conflict, chuẩn hóa mỗi dòng theo member/Team (b30f0f2, ce2cc5f) | Worklog ổn định, đồng bộ qua các nhánh |

### Bài học
- Hook AI logging phải được kiểm thử trên đúng môi trường chạy thật (Windows PowerShell) trước khi coi là hoạt động
- Worklog cập nhật theo ngày giúp truy vết công việc và tạo bằng chứng rõ ràng cho mỗi quyết định

### Kế hoạch tuần sau
- [ ] Xây dựng demo frontend mock và tài liệu Project Build Phase
- [ ] Đồng bộ nhánh và cải thiện quy trình PR

---

## Week 2: 2026-07-27 - 2026-08-02

### Mục tiêu tuần này
- [x] Xây dựng demo frontend mock NaviGo cho agent đặt dịch vụ đa nền tảng
- [x] Bổ sung tài liệu Project Build Phase, UI wireframe flow và architecture diagram
- [x] Refactor codebase ban đầu và tương thích pytest conftest

### Đã hoàn thành
- Fix Gemini hook logging; log_antigravity.py có SQLite fallback (67a8198, 4a8ede1)
- Thêm React web frontend và cập nhật modern UI demo NaviGo, cải thiện demo UI flows (a929f30, ff3d2d3, c575735, a5d0c8c)
- Bổ sung tài liệu Project Build Phase, docs/04-ui-design/ui-wireframe-flow.md, architecture diagram và link demo (83df9f7, f75012c, 4a92dad)
- Refactor codebase và sửa pytest conftest tương thích langchain.debug (887fa1b, bfa2ca0)
- Đồng bộ feature/demoUI và merge các PR #13–#24 vào develop

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Conflict khi merge feature/demoUI vào develop | Merge resolve conflict, đồng bộ từ develop (cd787aa) | Tích hợp demoUI sạch, không mất code |
| Test lỗi tương thích langchain.debug | Cập nhật pytest conftest (bfa2ca0) | Bộ test chạy ổn định sau refactor |

### Bài học
- Tài liệu (diagram, wireframe, docs) cần cập nhật cùng lúc với code để tránh lệch pha
- Refactor codebase phải đi kèm sửa test để giữ pipeline xanh

### Kế hoạch tuần sau
- [ ] Tách kiến trúc backend-first microservices (NestJS gateway + domain services)
- [ ] Xây dựng các dịch vụ Food/Ride/Restaurant/Healthcare và tích hợp local

---

## Week 3: 2026-08-03 - 2026-08-09

### Mục tiêu tuần này
- [x] Refactor repository sang kiến trúc backend-first microservices
- [x] Xây dựng domain services Food/Ride/Restaurant/Healthcare và gateway
- [x] Tích hợp bốn domain local (four-domain integration)

### Đã hoàn thành
- Refactor backend-first: chuyển FastAPI agent, thêm NestJS gateway + domain-service skeletons, Docker/Postgres và AGENTS.md (83aa797, a32a7ff)
- Xây dựng module medical booking agent + websocket, chuyển backend sang sandbox, tăng bảo mật (dcfa4fc, 187f800, b5903e4)
- Bỏ mock data, nối real backend endpoints, đồng bộ dark theme; implement restaurant booking agent workflow (3f0a7b7, de0d40b, e35843c)
- Phát triển ride service, gateway services ride và cập nhật food service (1318b65, 78e2101, b2d61ea)
- Finalize local four-domain integration, cập nhật docs và resolve conflict (f5c85a0, 8bb214f, d4fdb8d)

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Feature/ride chưa ổn định, bị revert sau merge | Revert PR #26 rồi phát triển lại trong nhánh riêng (9dc5034, 1318b65) | Ride service tích hợp lại sạch |
| Nhiều nhánh feature song song gây conflict khi tích hợp | Merge từng nhánh vào codex/p018-integration rồi merge develop (7ea1622, 02757ec, 7135d62) | Tích hợp 4 domain local thành công |
| Antigravity log chạy sai | Fix Antigravity log (c40bbec) | Log đúng và đầy đủ |

### Bài học
- Kiến trúc refactor cần tài liệu và AGENTS.md đi kèm ngay từ đầu để giữ boundary
- Tích hợp theo từng bước qua integration branch giảm conflict so với merge ồ ạt

### Kế hoạch tuần sau
- [ ] Hoàn thiện CI/CD (self-hosted runner, staging deploy) và Phase 1 Web App Router
- [ ] Sửa lifecycle Ride, map/tracking, agent multiturn và QA toàn diện

---

## Week 4: 2026-08-10 - 2026-08-16

### Mục tiêu tuần này
- [x] Hoàn thiện Phase 1 Next.js App Router, landing, product routing và authentication
- [x] Cải thiện CI/CD: self-hosted runner, staging deploy, caching, matrix test
- [x] Sửa lifecycle Ride, map/tracking, agent multiturn và MVP demo 4 dịch vụ

### Đã hoàn thành
- Baseline + contract; FE v1, hero section, visual/assets và fake chat (f7b31b3, 04c3a72, e60a125)
- CI/CD: self-hosted runner, job-level path filtering, matrix test, cache dependency, tránh postgres port collision, staging deploy workflow (a7eff83, d8ae480, 599c45a, 36e9593, c2f3e6a)
- Perf: chuyển gemini query parsing sang application service layer (a232042)
- Fix agent multiturn actions + active resource state; ride real routing/lifecycle; active Hanoi service catalogs; MVP tích hợp real four-service local demo (3a30434, d4f0127, 5872295, 6af0c39)
- Gateway validate agent results, harden public API; ride tracking simulation mượt (46fecbf, ab95357)
- Thêm mobile React Native; AI log, eval + docs + README; bridge healthcare legacy catalog migration; Gate 2 documentation (4a74bab, 573ae3b, 055aa59, 806e13a, 4657910)
- Deploy web với staging stack, fix ai-log, bổ sung healthcare 003 migration (c157ad6, 6ceca84, 59993bc)

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Python service test chậm, CPU starvation trên runner | Parallelize bằng matrix strategy, khi cần serialize pipeline (599c45a, 90a31e8) | Pipeline ổn định hơn |
| Postgres port collision khi chạy nhiều job | Random postgres service ports (c2f3e6a) | Hết xung đột port |
| Thiếu healthcare 003 migration | Bổ sung migration vào scripts (59993bc) | Migration chạy đủ |
| Agent multiturn mất active resource state | Repair multiturn actions và active-state flows (3a30434, 0611b22) | Hội thoại nhiều lượt ổn định |

### Bài học
- CI/CD cần tinh chỉnh theo runner thực tế (self-hosted vs ubuntu-latest) để tránh treo và tốn thời gian
- Sửa domain lifecycle phải đi kèm dữ liệu catalog thật (Hanoi) để demo khớp với thực tế

### Kế hoạch tuần sau
- [ ] Upgrade agent: postgres persistence, SSE streaming, Langfuse tracing
- [ ] Triển khai 2-VPS cho develop/main và fix CI failures

---

## Week 5: 2026-08-17 - 2026-08-23

### Mục tiêu tuần này
- [x] Upgrade agent: postgres persistence, SSE streaming, few-shot reasoning, Langfuse tracing
- [x] CI/CD: 2-VPS deployment, buildkit caching, smart deploy
- [x] Mobile thay mock bằng real API; tích hợp eval tool accuracy với Langfuse

### Đã hoàn thành
- CI/CD: automated 2-VPS deployment cho develop/main; fix CI failures (healthcare, gateway-postgres, web); no-cache build; buildkit layer caching + automatic migrations (502ac8d, 112eec3, 9b449ec, 9f3bddd)
- Web Dockerfile: copy pnpm virtual store, full node_modules cho swc helpers, thay pnpm symlink bằng file vật lý (c45a861, 4b77cf6, b7522ef)
- Agent: Langfuse tracing, conversational flexibility, model-first reasoning, chitchat + safe context switching, postgres persistence + SSE streaming + few-shot, circuit-breaker + fast-fail timeout, harden runtime boundaries/planning handoff, safe tracing + service dispatch (37682ce, b21c2be, 889b87b, 31028f5, 0529892, 58447b1, 4eaf90e, 73e0b12)
- Mobile: thay mock data bằng real API integration (61ba9c4)
- Food: conversational checkout address clarification; eval test tool accuracy với Langfuse (97cfe1e, 33ae4f4)
- Merge Feature/agent qua PR #50 và #51 (cadb86c, 41eb42f)

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Web runtime thiếu swc helpers sau build | Copy full node_modules + thay pnpm symlink bằng file vật lý (4b77cf6, b7522ef) | Web chạy đúng trên VPS |
| CI failures ở nhiều job (healthcare, gateway-postgres, web) | Fix từng job, dùng --no-cache build tránh cache corruption (112eec3, 9b449ec) | CI xanh trở lại |
| Database pool trong test dễ treo | Circuit-breaker + fast-fail timeout cho db pool (0529892) | Test ổn định hơn |
| Conflict giữa các nhánh agent khi merge | Merge develop vào agent planning, fix lint và TypeScript (a8ac080, 48514ea, 8faac03) | Agent merged qua PR #50/#51 |

### Bài học
- Agent mạnh hơn khi có persistence + streaming + telemetry đi kèm với boundary hardening
- Deploy thật (VPS) phơi ra các lỗi chỉ xuất hiện lúc runtime (swc helpers, cache corruption)

### Kế hoạch tuần sau
- [ ] Redesign UI assistant chat, dual collapsible sidebars và Google OAuth
- [ ] Admin console, voice STT/TTS, fix address/geocoding và migration resilience

---

## Week 6: 2026-08-24 - 2026-08-30

### Mục tiêu tuần này
- [x] Redesign web assistant UI (dual collapsible sidebars, typography Be Vietnam Pro, ride ticket card)
- [x] Google OAuth 2.0, admin console và voice STT/TTS
- [x] Fix address/geocoding, ride lifecycle/quote, migration resilience và e2e
- [x] Reconcile và integrate các fix vào develop (feat/AIcore)

### Đã hoàn thành
- UI: redesign assistant chat, app shell sidebar, service cards + live activity, 100% typography Be Vietnam Pro, dual collapsible sidebars, notification bell, floating pill edge toggles, composer full width (7f66d1d, e68cb31, 30577f8, 48230a6, 285cfe8)
- Auth: tích hợp Google OAuth 2.0 ở gateway + web, redirect /app hoặc onboarding; harden session restore và password policy (19380a7, 40bff6e, 0665c9b, b6f4d57)
- Agent-service: multi-key GEMINI_API_KEYS round-robin + failover; enforce scope boundary, ngăn replay cancelled/failed services (28d4344, 32b3f60, a2568af)
- Admin: api keys rotation + console management, mask secrets, dashboard live diagnostics, user pagination + disband/reactivation (22ae796, 8fd1a0d, 8b328db, 447c069)
- Voice: voice input/output STT-TTS qua PR #70/#71/#73, fix multer typing conflict trong CI (5a2e113, c49e9ea, b2666ad, c4bc721)
- Address: fix geocoding + default delivery address, dedup profile address loading, deterministic address fixtures + autocomplete (73bcc2d, 5cdc231, 5d28a4f, 56aadc6)
- Ride/Restaurant/Healthcare: reconcile quote snapshot + phantom alembic revision, tracking poll chỉ khi mở map, server-side pagination cho food/restaurant/healthcare, patient profile update/unlink (23fe6e5, 494ca2c, 674bdd6, 99a41af, b7a8b33)
- Migration/deploy: chạy Alembic từ fresh images, fix migration lock hang + e2e reliability; integrate tooling/auth-profile/product/restaurant/ride, test e2e fixtures, ruff resolve (13689b9, 2ee72ed, 153a26e, ce876d9, 8946350)

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Migration lock hang + e2e không ổn định | Chạy Alembic từ fresh images, tăng resilience CI/CD (13689b9, 2ee72ed) | Migration/e2e ổn định |
| Phantom alembic revision 20260828_0008 và quote snapshot lệch | Reconcile revision và quote snapshot (494ca2c, 23fe6e5) | Ride migration hợp lệ |
| Báo giá Ride bị gắn nhãn "Đã tạo chuyến" trước khi xác nhận | Fix label theo trạng thái xác nhận (b3dd17b) | Luồng xác nhận đúng |
| Address/geocode sai, dropdown địa chỉ bị che | Harden address matching, thêm fixtures deterministic + autocomplete (73bcc2d, 56aadc6) | Địa chỉ và map hiển thị đúng |
| Voice file upload lỗi typing trong CI | Fix multer typing conflict ở gateway (c4bc721) | CI pipeline pass |
| Test isolation và lint khi integrate nhiều nhánh | Fix test isolation + ruff resolve (d478f22, 8946350) | Suites pass |

### Bài học
- UI redesign quy mô lớn cần đi cùng sửa regression (scrollbar, contrast, dropdown bị che)
- Nên reconcile migration revision định kỳ để tránh phantom revision khi nhiều nhánh cùng tạo migration
- Integrate fix theo từng phần (tooling/auth-profile/product/restaurant/ride) giúp review dễ và ít conflict

### Kế hoạch tuần sau
- [ ] Chốt main (PR #77) và upload slide tổng kết
- [ ] Kiểm thử end-to-end toàn bộ luồng trước buổi demo

---

## Week 7: 2026-08-31 - 2026-09-01

### Mục tiêu tuần này
- [x] Merge develop vào main (PR #77)
- [x] Upload slide tổng kết dự án

### Đã hoàn thành
- Merge PR #77 từ develop vào main (86b34c2)
- Upload slide tổng kết (a674ce2)

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| | | |

### Bài học
- Giữ develop luôn xanh và merge main sớm trước deadline demo để slide/tài liệu khớp với code đã chốt

### Kế hoạch tuần sau
- [ ] Trình bày demo và báo cáo tổng kết dự án
- [ ] Hoàn thiện hồ sơ nghiệm thu và tài liệu cuối kỳ

---
