# Worklog — Team P-018 (VinUni AI20K Cohort 3)

---

## 2026-08-11

### Phase 1 - focused landing visual redesign pass

- Changed the marketing header to a true fixed header, tightened the hero and
  made the desktop title two intentional lines over clearer full-bleed Hanoi
  media while preserving the composer, rotating prompts and reduced-motion
  poster path.
- Split Motion into one-time `RevealScene`/`RevealItem` entrances and bounded
  post-entry `ScrollFocusScene` depth, with section-specific choreography for
  services, steps, story, map, safety, assistant and CTA.
- Redesigned the existing supported-services scene into exactly four visual
  cards, added Ice/Sand/Mist/Slate tonal surfaces, kept the real map asset, and
  replaced public screenshot fallbacks that exposed `MEDIA SLOT`/file paths
  with neutral product panels.
- Replaced the monolithic Web stylesheet with canonical globals, feature CSS
  files and scoped marketing modules. Auth dialog behavior, Gateway boundary,
  standalone auth routes, current media assets and XOneMark remain unchanged.
- Frozen workspace install, Web typecheck, Jest (`7` suites / `16` tests),
  production build (`15` routes), targeted landing-contract tests and
  `git diff --check` passed. Browser visual evidence is `UNVERIFIED`: the
  in-app browser reported no available instances and the fallback
  `agent-browser` CLI is not installed. No cloud side effects, secrets
  printed, commit or push.

### Phase 1 - Next.js migration, landing, routing, and real authentication

- Delivered the Web migration from Vite/React Router to Next.js App Router with a calm X-One landing page, product routes, loading/error/not-found states, memory-only access-token handling, and Gateway-only browser requests. The landing advertises exactly Food, Ride, Restaurant, and Healthcare; optional hero-video hooks do not bundle or generate video assets.
- Delivered Gateway Auth v1: Argon2id credentials, maintained-library HS256 JWT signing/verification, refresh-token rotation and reuse invalidation, HttpOnly refresh cookies, origin checks, session management, password change/reset, owned `009_core_auth.sql` migration, OpenAPI contract, and PostgreSQL integration coverage.
- Final checks passed: environment validation `99/95`, migration parity `16`; Gateway `20` suites with `82 passed, 7 skipped, 89 total`; Web `4` suites / `6` tests and `15` generated routes; Agent `103 passed`; Ride `10 passed`; Restaurant `20 passed, 1 skipped`; Healthcare `21 passed, 1 skipped`; Food `22 passed, 3 skipped`; Ruff passed in all five Python scopes.
- Fresh disposable Compose project `xone-phase1-20260811-005855` reached eight healthy containers. Migrations were run twice, Core/Auth PostgreSQL reported `2` suites / `7` tests, direct auth HTTP acceptance passed, and fourteen Web routes plus landing SSR returned HTTP `200`. The isolated project and its newly created volume were removed afterward; no existing persistent volume was touched.
- Browser control was unavailable, so screenshot, responsive, interactive, and browser-console acceptance are explicitly `UNVERIFIED`. No cloud side effects, commit, push, secret printing, AI-video generation, Phase 2 work, or manual `.ai-log` editing occurred.

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Team P-018 | Phase 1 Next.js migration + landing + product routing + real auth | Implementation/runtime PASS; browser UNVERIFIED | Next App Router Web, real Gateway Auth v1, owned migration/contract/docs/CI, full non-browser regression and disposable runtime evidence | - |

**Daily summary:** Phase 1 implementation and all available non-browser acceptance gates passed. Browser evidence remains intentionally unverified because this environment has no usable browser instance.

---

## 2026-08-10

### Phase 0 — baseline + contract + security + ownership foundation

- Baseline and changed-surface verification: Agent Ruff and `103 passed`; Gateway lint/build and `17` passed suites with `72 passed, 5 skipped` tests; Food `22 passed, 3 skipped`; Ride `10 passed`; Restaurant `20 passed, 1 skipped`; Healthcare `21 passed, 1 skipped`; contract tests `2 passed`; Web `npm ci` and build; environment validation, Compose example config, migration parity, Python syntax, and `git diff --check` passed.
- Foundation delivered: canonical API inventory, versioned shared OpenAPI primitives, Tool Registry v2 specification, auth/address/Healthcare ownership ADRs, additive migration policy, Gateway CORS/security headers/body limit/rate profiles, safe parser/rate-limit envelopes, fail-closed development/test-only demo auth, production `PATIENT_LINK_REQUIRED` boundary, explicit Food legacy-address adapter contract, and explicit non-credentialed CORS on internal FastAPI apps.
- Security handling: the user-provided Gemini key remains in the Agent service environment; its value was not read, printed, copied, or added to source/docs. No raw prompt, provider payload, or chain-of-thought was added.
- Runtime status: fresh current-worktree acceptance used disposable project `xone-phase0-corrective-20260810-1` with `.env.example`, dummy values, deterministic Agent mode, and a test-only Gateway login-limit override. All seven containers were healthy after migrations/seeds; Gateway live/readiness returned `200/200`; public deterministic E2E passed `31/31` in `166.89s`; the disposable project/volume was removed afterward; existing `p-018` was not touched. Gemini was not called and the key was preserved.

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Vũ Văn Phong (2A202601647) | Corrective review/fix and fresh acceptance for Phase 0 Baseline + Contract + Security + Ownership Foundation | ✅ Phase 0 PASS | Demo auth fail-closed tests, production-safe Compose/env/patient boundary, shared Address/Food legacy contract test, Tool Registry v2 audit, Agent/domain/Gateway/Web checks, fresh disposable health/migrations/seeds and deterministic public E2E `31/31`; Browser `UNVERIFIED`; no commit/push | - |

**Tổng kết ngày:** Corrective Phase 0 review is complete and the fresh disposable runtime gate passed. Production/demo-auth, patient-link, Address ownership, and Tool Registry statuses are synchronized; no secret was exposed, no `p-018` volume was deleted, and no commit/push was made.

---

## 2026-08-09

### Evidence-only code-freeze recount

- BASE SUITES: the exact `python -m pytest tests -q` command ran once per service. Food: `22 passed, 3 skipped` (`25` collected); Ride: `10 passed` (`10` collected); Restaurant: `20 passed, 1 skipped` (`21` collected); Healthcare: `21 passed, 1 skipped` (`22` collected). Ruff, targeted PostgreSQL, deterministic public E2E, and live Gemini are separate categories and were not added to these counts.
- SOURCE RECONCILIATION: commands ran from `C:/Users/ADMIN/Personal_proj/AIBuildPhase/P-018` at HEAD `6672e988c4cdd4de19a542a0ab4bacfbad216367` after capturing the dirty worktree. All collected service test sources are tracked and inside the root; no untracked, ignored, generated, or outside-root test source was counted. `develop.xml` lists but omits packed content for the four tracked service `tests/test_config.py` files; their node IDs contribute exactly Food `+4`, Ride `+3`, Restaurant `+3`, and Healthcare `+4`. This explains the incomplete `21/7/18/18` snapshot recount and proves repository collection `25/10/21/22`; exact node IDs are in `docs/development/testing-strategy.md`. No test was changed.
- TARGETED POSTGRESQL remains separate: Food `3/3`; Gateway Core `5/5`.
- DETERMINISTIC PUBLIC E2E source collection: `31 tests collected`; the recorded runtime proof remains `31 passed`, zero skipped, including Ride Gateway-restart/replay proof. LIVE GEMINI evidence is unchanged: primary Gemini 3.5 success, fallback Gemini 3.1 success, public Agent `decision_source=model`, Food public `201/201`, demo-critical `4/5`, and one Healthcare category-C assertion/wording mismatch with no state/action bug. Prior `25/31` live-provider evidence remains `3 B/transient + 3 C/assertion-only`, with no D/E failure.
- NPM ADVISORY: both full and omit-dev audits report one high transitive `nanoid@3.3.16` through `vite@6.4.3 -> postcss@8.5.25`; affected `<3.3.17`, with compatible patched `3.3.17`/`3.3.18` and `fixAvailable=true`. Omit-dev still reports it because the build toolchain is declared/locked as production. It is build-only for this deployment: Vite runs in the Docker builder, final Nginx/browser assets contain no Nanoid/PostCSS/custom-generator code, and PostCSS uses constant `nanoid(6)`, not the vulnerable zero-size path. No dependency/lockfile change was made.
- Direct CI/lockfile verification passed: all three lockfiles/workflow files are tracked; working-tree CI covers Ruff for all five Python services, Gateway frozen pnpm install, and Web `npm ci`.
- Static checks passed: compileall, migration parity (`15 files`), environment validation (`81 root variables, 77 Compose variables`), Compose config, shell syntax/host normalization, and `git diff --check`. `.gemini/settings.json` uses `STITCH_API_KEY` env expansion; no literal credential was printed; `medical_tools.py` is absent; Web/Agent boundaries remain clean.
- Browser smoke: `UNVERIFIED`. SECURITY ACTION REQUIRED BY USER: revoke/rotate the previously exposed Stitch API key. No runtime/business/test logic was changed in this pass; no re-merge, commit, push, cloud action, or PostgreSQL volume deletion.

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Vũ Văn Phong (2A202601647) | X-ONE final evidence pass: security, CI/lockfile, base suites, PostgreSQL, deterministic public E2E và live Gemini demo | ✅ Done | Tracked Stitch setting dùng env expansion; secret scan 0 findings; Agent `103 passed`; Food `22 passed, 3 skipped`; Ride `10 passed`; Restaurant `20 passed, 1 skipped`; Healthcare `21 passed, 1 skipped`; Gateway `55 passed, 5 skipped, 60 total`/build; Web `npm ci`/build; Food PG `3/3`, Gateway PG `5/5`; public E2E `31/31` trong `164.95s`, zero skip, Ride restart/replay/different-key rejection pass; live demo `4/5` assertion passes, one Healthcare mismatch classified C; browser UNVERIFIED. Người dùng vẫn cần revoke/rotate Stitch key đã từng bị lộ; không commit/push/cloud, không xoá volume p-018 | - |

**Tổng kết ngày:** Đã tách rõ BASE SUITES, TARGETED POSTGRESQL, DETERMINISTIC PUBLIC E2E và LIVE GEMINI SMOKE. Kết quả acceptance là PASS: deterministic public E2E `31/31`; live demo `4/5`, lỗi còn lại là category C (assertion/model wording, không có state/action bug). Sáu lỗi live-provider cũ đã được phân loại an toàn trong `docs/development/testing-strategy.md` và `job.txt`, không còn ghi chung là “provider variability”. Browser giữ `UNVERIFIED`; không in key/prompt/provider payload, không xoá volume `p-018`, không commit/push/cloud. Người dùng vẫn cần revoke/rotate Stitch key đã từng bị lộ.

---

## 2026-08-08

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Vũ Văn Phong (2A202601647) | Gộp final X-One correctness và Demo Hardening pass: unified Assistant cho Ride/Food/Restaurant/Healthcare, task revision/action cohort, idempotency retry, Food context, Healthcare requested time, Ride vehicle/location, Restaurant migration/validation/contract, stable consumer DTO, Gemini diagnostics, Gateway-only Web và UI cleanup | ✅ Done | Agent 78 pass; Food 22 pass/3 skip; Restaurant 18 pass/1 skip; Healthcare 20 pass/1 skip; Ride 10 pass; Gateway lint/Jest 40 pass/3 skip/build; Web build; migrations/seeds/Compose health pass; ephemeral Restaurant 0001→head replay proof giữ 2 reservation ID; live E2E 23/23 (3 unified regression cases bổ sung); parser ngày tuyệt đối và persistent E2E collision đã xử lý; Gemini live không chạy (deterministic acceptance), browser-control unavailable; không commit/push/cloud | - |

---

## 2026-08-07

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Vũ Văn Phong | Final corrective pass: migration parity, stale payment-confirmation linkage, terminal refund semantics, bounded Agent address orchestration, voucher stale mapping, real timeout/restart E2E, PostgreSQL cart concurrency, Gemini smoke và setup script | ✅ Done | Agent 20 pass, Food 21 pass/3 skip, Gateway 17 pass/3 skip, Food PostgreSQL 3 pass, Core PostgreSQL 3 pass, E2E 15 pass, Bash/PowerShell migration và Docker build/health pass; Gemini 4 calls fallback do provider error; không commit/push | - |
| Team P-018 | Final Agent orchestration pass: reconcile deterministic/model intents, preserve Gemini semantic enrichment, prove five-turn public confirmation flow, and sync evidence | ✅ Done | Added reconciliation and deterministic semantic-slot precedence; Agent 50 passed; Food 21 passed/3 skipped; Gateway 18 passed/3 skipped plus lint/build; registry HTTP 200 with 21 tools; live structured decision accepted with no fallback; fresh Vietnamese five-turn public flow ended in `confirmation_form` / `PLACE_FOOD_ORDER` with final `prepare_food_order_confirmation`; bypass emitted no transaction tool; migration/env/Compose checks passed; no commit/push | - |

> Ghi lại tất cả công việc đã làm theo ngày của các thành viên trong đội. Đảm bảo minh bạch tiến độ, kết quả công việc và theo dõi sử dụng AI.
>
> Quy ước cột Member: mỗi dòng chỉ dùng một tên người hoặc `Team P-018` cho công việc chung của cả đội.

---

## 2026-08-06

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Vũ Văn Phong | Triển khai Food ordering vertical slice backend | ✅ Done | Food FastAPI domain/API/PostgreSQL migration-seed; Gateway auth, typed Food/Agent clients, Tool Registry/Executor, confirmation, payment sandbox, workflow; Gateway-only structured LangGraph agent; contracts, Compose/env, docs, tests và `job.txt`; giữ nguyên phạm vi không sửa frontend/restaurant-service | - |

**Tổng kết ngày:** Đã nối happy path backend từ intent tiếng Việt → Gateway tool → Food preview → confirmation → sandbox payment → order tracking/refund path. Gateway Core durable repository và timer reconciliation vẫn được ghi nhận là follow-up.

---

## 2026-08-05

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Vũ Văn Phong | Chuẩn hóa environment, kiến trúc và governance tài liệu X-One theo backend-first | ✅ Done | Thiết lập một root `.env` với Compose inject tối thiểu; di chuyển Agent, thêm API Gateway và Ride/Restaurant/Healthcare/Food skeletons cùng PostgreSQL logical databases; làm rõ Food ownership và Restaurant reservations; tăng cường contracts, CI, docs, `AGENTS.md`, package discovery và error hygiene; bổ sung governance nhẹ về precedence, logical/physical data ownership, target/current state, vertical slice, idempotency, confirmation, prompt safety và legacy-doc warnings; `.env` hiện có được giữ nguyên. | 5.0h |
| Team P-018 | Tối ưu hóa monorepo và cập nhật tài liệu từ nhánh `develop` trước architecture refactor | ✅ Done | Bảo tồn lịch sử: cập nhật DB driver, Ruff formatting, agent state/nodes, web build và tài liệu. Các tuyên bố implementation hiện hành vẫn theo `docs/architecture/current-state.md`. | 1.5h |

**Tổng kết ngày:** Hoàn thành foundation, environment và architecture-governance refactor; xác minh gateway lint/test/build, web build, các domain health tests, package discovery, Compose config và Python compile. Docker build và stack smoke test đã thành công; toàn bộ service/postgres đều healthy. Agent pytest/Ruff đầy đủ vẫn phụ thuộc các development package Python chưa có trên host.

---

## 2026-08-02

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Vũ Văn Phong | Bổ sung tài liệu Project Build Phase vào `docs/`; ghi nhận AI usage log và đồng bộ nhánh; tạo repo GitHub `uiDemo` để deploy demo Vercel; cập nhật wireframe/UI flow, architecture diagram và chuẩn hóa worklog | ✅ Done | Thêm `docs/Project Build Phase.docx.pdf`; ghi từng prompt thành AI-log; merge work qua `develop` và mở PR #15/#16 vào `main`; tạo repo private `VuVanPhong123/uiDemo`, push riêng `frontend-web` lên nhánh `main`; thêm `docs/ui_wireframe_flow.md`; cập nhật `docs/architecture_diagram.md` đúng với Vite React demo, MockService/localStorage, FastAPI/LangGraph integration path và tài liệu PDF trong `docs/`; gộp các dòng worklog trùng member | 2.4h |
| Trần Văn Tài | Hoàn thiện và tinh chỉnh demo frontend cho agent đặt dịch vụ đa nền tảng | ✅ Done | Cập nhật `frontend-web` thành demo mock có hội thoại tiếng Việt, biên lai đặt xe/đồ ăn/chuyến bay, combo, đổi vé/hoàn tiền, chọn xe đưa đón, nút xác nhận thanh toán và modal thành công; khóa sidebar/topbar, chỉ cho vùng chat scroll; xác minh `npm run build` pass và dev server Vite chạy tại `localhost:5173` | 1.0h |
| Lê Tiến Minh | Hoàn thiện và tinh chỉnh demo frontend cho agent đặt dịch vụ đa nền tảng | ✅ Done | Cập nhật `frontend-web` thành demo mock có hội thoại tiếng Việt, biên lai đặt xe/đồ ăn/chuyến bay, combo, đổi vé/hoàn tiền, chọn xe đưa đón, nút xác nhận thanh toán và modal thành công; khóa sidebar/topbar, chỉ cho vùng chat scroll; xác minh `npm run build` pass và dev server Vite chạy tại `localhost:5173` | 1.0h |
| Team P-018 | Cập nhật worklog cho các thay đổi tài liệu và demo frontend | ✅ Done | `WORKLOG.md` được cập nhật bằng UTF-8 để giữ đúng tiếng Việt có dấu; tài liệu dự án, diagram và UI flow được gom trong `docs/` | 0.3h |

**Tổng kết ngày:** Đã bổ sung tài liệu Project Build Phase, hoàn thiện demo frontend cho agent hỗ trợ đặt nhiều dịch vụ trong một app, kiểm tra build/dev server, tạo repo demo riêng để deploy Vercel và cập nhật tài liệu trong `docs/`. Worklog đã được chuẩn hóa để mỗi dòng chỉ có một member hoặc `Team P-018`, không còn dòng trùng tên trong cùng ngày.

---

## 2026-07-26

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Lê Tiến Minh | Rà soát, kiểm thử tích hợp AI Antigravity CLI và chi tiết hóa `WORKLOG.md` | ✅ Done | Xác nhận hook logging hoạt động ổn định trên Windows PowerShell; cập nhật `WORKLOG.md` chi tiết với mốc lịch sử commit, PR và bảng theo dõi | 1.3h |
| Team P-018 | Kiểm tra liên kết git history, PR #4, trạng thái repo và workflow AI log | ✅ Done | Các branch `main`, `develop` và `test` được đồng bộ; branch `test/verify-ai-log` được tạo để kiểm thử AI usage logging hook và quy trình nộp AI log qua PR vào `develop` | 0.9h |

**Tổng kết ngày:** Đã chi tiết hóa toàn bộ worklog dự án, rà soát lại kết quả tích hợp AI logging script (`scripts/submit_log.py`, `scripts/setup_hooks.ps1`), tạo nhánh test và kiểm tra quy trình nộp AI log qua PR vào `develop`.

### Bổ sung kỹ thuật và bằng chứng

- **Codex CLI hook:** commit `d805095` cập nhật `.codex/hooks.json` và thêm `scripts/log_codex_hook.py`. Hook được khai báo cho cả sự kiện `UserPromptSubmit` và `Stop`; wrapper đọc event từ stdin, chuẩn hóa qua `log_hook.normalize`, ghi vào `.ai-log/session.jsonl` và luôn trả về JSON `{}` để không chặn Codex CLI.
- **Xác minh worklog:** commit `2f4633f` ghi nhận kết quả kiểm tra AI log. Tại thời điểm rà soát, nhánh `test/verify-ai-log` trỏ tới commit này; local `develop` cũng đang chứa commit đó.
- **Độ tin cậy khi nộp log:** `scripts/submit_log.py` gửi tối đa 500 bản ghi mỗi lần, archive bản ghi sau khi gửi thành công và khôi phục batch pending nếu yêu cầu HTTP lỗi, nhằm tránh mất log.
- **Phạm vi test hiện có:** `pytest --collect-only -q` thu thập 5 test (2 test graph agent, 3 test API). Không ghi nhận kết quả pass của toàn bộ suite trong mục này vì lần chạy đầy đủ chưa hoàn tất trong giới hạn thực thi hiện tại.

---

## 2026-07-25

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Vũ Văn Phong | Tạo branch `test`, cập nhật `WORKLOG.md`, kiểm tra AI usage logging hook và xử lý PR test workflow | ✅ Done | Branch `test` được tạo từ `develop`; `WORKLOG.md` cập nhật; hook pre-push dùng `scripts/submit_log.py`; PR #2 được mở và merge vào `develop` thành công | 1.2h |
| Trần Văn Tài | Đồng bộ nhánh và cập nhật nhật ký dự án ban đầu | ✅ Done | Merge PR #3/#4 để đồng bộ `develop` vào `main`; commit `0ffcd10` bổ sung dữ liệu tuần làm việc trong `JOURNAL.md` | 0.7h |
| Team P-018 | Khởi tạo môi trường phát triển, cấu hình `.env` và cài đặt Git pre-push hook nộp AI log | ✅ Done | Môi trường `.venv` và dependencies từ `requirements.txt` được cài đặt; file `.env` hoàn tất; hook AI log active và verified | 2.0h |

**Tổng kết ngày:** Hoàn tất thiết lập môi trường phát triển, cài đặt AI logging pre-push hook, kiểm thử thành công quy trình tự động ghi log AI usage và xử lý các Pull Request (#1 - #4) để đồng bộ nhánh với `develop`.

---

## 2026-07-23

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Vũ Văn Phong | Khởi tạo repository dự án từ template AI20K Agent | ✅ Done | Mã nguồn khởi tạo với đầy đủ khung dự án LangGraph, FastAPI và Docker | 1.5h |
| Team P-018 | Thiết lập cấu hình môi trường, AI Logging Hook, CI/CD và bộ khung tài liệu dự án | ✅ Done | Đã cài đặt `.env`, `scripts/setup_hooks.ps1` / `setup_hooks.sh`, cấu hình GitHub Actions, hoàn thiện `README.md`, `ARCHITECTURE.md` và `docs/` | 2.2h |

**Tổng kết ngày:** Đã khởi tạo hoàn chỉnh dự án AI20K Agent Template, cài đặt thành công môi trường phát triển ban đầu, kích hoạt AI Logging Hook và sẵn sàng cho việc thiết kế Agent.

---

## Template Ghi Log Hằng Ngày (Sao chép khi tạo ngày mới)

```markdown
## YYYY-MM-DD

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| [Tên một thành viên] | [Mô tả chi tiết task] | ✅ Done | [Mô tả kết quả/Link file/PR] | 2.0h |
| Team P-018 | [Mô tả công việc chung của đội] | 🔄 WIP | [Tiến độ hiện tại] | 1.5h |
| [Tên một thành viên] | [Mô tả blocker] | ❌ Blocked | [Lý do bị vướng và hướng xử lý] | - |

**Tổng kết ngày:** [1-3 câu tóm tắt thành quả đạt được và định hướng công việc tiếp theo]
```
