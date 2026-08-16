# Current Architecture State

This is the canonical, filesystem-backed source of truth for X-One's implementation status. Structure, ownership, ports, routes, migrations, and command surface were last re-verified against the checked-in files on 2026-08-16. It supersedes earlier Phase 0 descriptions that referred to a Vite Web demo or demo-only public authentication. Historic work evidence belongs in `WORKLOG.md`; it is not a claim about the current implementation.

## Status vocabulary

- **implemented**: source/configuration exists and a cited verification has
  passed for this worktree.
- **skeleton**: a route or boundary exists but the underlying domain capability
  is not wired.
- **planned**: no runnable/wired implementation exists.
- **unverified**: source/configuration exists but this worktree has not yet
  completed the named runtime acceptance check.

## Gate G2 audit snapshot - 2026-08-16

The Gate G2 documentation, Compose contract, and evaluation runner were
audited against the current filesystem. Static validation and Compose rendering
passed after the offline deterministic default and explicit provider mapping
changes. An isolated Compose stack was then built, migrated, seeded, and
health-checked; seven public Gateway cases ran with 6/7 passing. Safe Agent
diagnostics recorded a successful Gemini call without fallback. The canonical
record is [the Gate G2 evaluation report](../../eval/results/gate-g2-mvp-eval.md);
E02 remains an explicit assertion mismatch, not a hidden pass claim.

## Current local completion evidence - 2026-08-13

The local release-candidate path is wired from Web through Gateway to the
authoritative service and database for all four product domains. Core migration
`012_core_product_ops.sql` owns durable notifications, favorites, feedback,
support tickets and ticket events; `013_core_admin_support_idempotency.sql`
owns the Admin support-update replay evidence. Product/Ops and Admin routes
are actor/role scoped and the domain data remains owner-local.

The direct-process runtime (`scripts/local-dev.ps1`) was restarted with
`.env.example`; Gateway, Web, Agent, Ride, Restaurant, Healthcare and Food
health checks passed. Additive local seed produced the synthetic Ride pool and
demo Healthcare records without removing imported catalog rows. Playwright
Chromium passed 27/27 responsive tests, live Product 2/2, Admin 1/1 and the
real multi-domain transaction flow 1/1. The optional `agent-browser` CLI is
not installed; these browser results came from Playwright Chromium.

`LOCAL_DETERMINISTIC_LOCATION_FALLBACK=true` and
`RIDE_TRACKING_TIME_SCALE=60` are local-only test/demo settings. Production
validation rejects the deterministic location flag and requires the Ride
tracking scale to remain `1.0`; external geocoding/routing remains optional
and explicitly labeled when unavailable.

For the final corrective pass, capability and acceptance labels use the
following explicit vocabulary where applicable: `IMPLEMENTED_RUNTIME`,
`IMPLEMENTED_AGENT_TOOL`, `IMPLEMENTED_GATEWAY_ACTION`,
`IMPLEMENTED_DOMAIN_API`, `LEGACY_COMPAT`, `DEPRECATED`, and the historical
`BROWSER_ACCEPTANCE_PENDING` label. The current 2026-08-13 browser result is
recorded above and supersedes that historical pending state.

## Runtime and ownership

Web and mobile call only the NestJS Gateway. The Next.js Web's `/api/health`
is a technical Docker probe only; it is not a BFF, domain proxy or authority.
The Gateway validates public requests, routes typed internal clients and owns
Core audit/idempotency/session evidence, but never writes a domain's data by
cross-domain SQL. The Agent emits validated typed requests only and does not
make a booking, payment or database call. Restaurant owns dine-in
reservations; Food owns menus, food orders and delivery ordering.

One physical PostgreSQL instance provisions separate logical databases/owners:
Core `xone_core`, Agent target `xone_agent`, Ride `xone_ride`, Restaurant
`xone_restaurant`, Healthcare `xone_healthcare` and Food `xone_food`.
Cross-database queries, foreign keys, shared ORM models and shared domain
business logic are prohibited.

## Observed implementation matrix

| Component | Status | Evidence | Current limitation |
| --- | --- | --- | --- |
| Web | implemented | `apps/web/src/app/`, `src/components/marketing/`, `src/features/`, `src/providers/auth-provider.tsx`, `src/lib/api-client.ts` | Next.js App Router provides landing, auth, resumable onboarding, app/admin route guards, persistent conversations/history, saved-address CRUD, Service Hub browse/action states, map/location and Ride tracking states. Jest (13 suites/52 tests), typecheck/build pass; Playwright Chromium 27/27 responsive and live Product/Admin/transaction suites pass. |
| Web UI system | implemented | `docs/design-system.md`, `docs/motion-system.md`, `apps/web/src/app/globals.css`, `apps/web/src/styles/`, `apps/web/src/components/marketing/*.module.css`, `motion/react` components | Calm task-first Vietnamese UI has route loading/error/empty/disabled states, reduced-motion handling, responsive shells, location/map panels, and tracking polling. The map is a deterministic visual snapshot, not a claim of a production map provider. |
| Gateway real authentication | implemented | `apps/api-gateway/src/modules/auth/`, migration `009_core_auth.sql`, `gateway-auth-v1.yaml` | Password-reset email delivery is a deliberate future seam. Test-only reset capture is rejected in production and not rendered by the Web. |
| Core persistence | implemented | `apps/api-gateway/src/modules/core/`, `migrations/001`--`013` | Runtime uses PostgreSQL; in-memory Core/Auth repositories are deterministic test adapters. Core now persists profile context, saved addresses, conversation metadata and multi-service plans with idempotency evidence. |
| Agent persistence | skeleton | `apps/agent-service/src/application/workflow_store.py`, `apps/agent-service/src/config.py` | `workflow_store` is process-local and no Agent persistence client/migration is wired. `xone_agent` is provisioned for target checkpoint/run metadata, so Agent state is lost on restart. |
| Unified assistant | implemented | `apps/api-gateway/src/modules/conversation/`, `apps/web/src/features/assistant/` | Existing Food/Ride/Restaurant/Healthcare authority and two-step confirmation boundaries are preserved; durable conversation data is Core-owned and model output remains typed/untrusted. Service Hub direct browse/action routes use the same typed clients and confirmation/idempotency boundaries. |
| Ride lifecycle | implemented | `services/ride-service/src/domain/ride.py`, `src/application/ride_service.py`, `src/infrastructure/models.py`, migration `20260812_0003_ride_lifecycle.py`, `apps/api-gateway/src/modules/conversation/ride-conversation.service.ts` | `IMPLEMENTED_RUNTIME`: DB tariff/driver lookup, quote expiry/consumption, two confirmations, persisted booking transitions, tracking events, idempotent replay, and actor-scoped history. Disposable HTTP proof observed `AWAITING_CONFIRMATION → SEARCHING_DRIVER → DRIVER_ASSIGNED → DRIVER_TO_PICKUP → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED`. |
| Tool Registry / Agent parity | implemented | `apps/api-gateway/src/modules/tools/tool-registry.ts`, `packages/contracts/tools/tool-registry-v2.json`, `apps/agent-service/tests/test_agents/test_tool_registry_parity.py` | Version-2 inventory has 46 canonical entries: 23 `IMPLEMENTED_AGENT_TOOL`, 12 `IMPLEMENTED_GATEWAY_ACTION`, and 11 `IMPLEMENTED_DOMAIN_API`. Active V1 compatibility paths remain and runtime→JSON parity is one-way; the Agent never executes final side effects. |
| Service Hub/history/location/patient context | implemented | `apps/api-gateway/src/modules/services/`, `history/`, `personal/`, `apps/web/src/app/app/services/`, `history/`, `addresses/`, `patients/` | Gateway aggregates typed domain reads with partial/degraded responses; Core owns saved addresses, Healthcare owns patient links, and the location provider is optional with a labeled deterministic fallback. |
| Catalog data pipeline | implemented | `scripts/data_pipeline.py`, `scripts/dataops/catalog_import.py`, `data/**`, additive Food/Restaurant/Healthcare provenance migrations | Dry-run and two idempotent applies on a disposable Compose PostgreSQL stack imported Food `17,596`, Restaurant `1,307`, and Healthcare `281` normalized records with zero rejected rows. Active dataset versions and representative DB counts were read back; the malformed specialty source is repaired into derived output with `70` reported repairs, never rewritten in place. |
| Recommendation + multi-service reliability | implemented | `apps/api-gateway/src/modules/workflow/multi-service-reliability.ts`, `reliability.module.ts`, `conversation/orchestration.ts`, Core migration `011`, tests | Deterministic ranking, owning-service resource re-read, dependency/partial-success/compensation semantics, step idempotency, and durable plan readback are wired. Route-provider ETA is available for explicit routes/quotes; live browser transaction coverage passed. |
| Product routes | implemented | `apps/web/src/app/app/`, `apps/web/src/app/admin/` | `/app`, conversations, history/detail, services/browse, profile, addresses, settings and `/admin` routes build with route-level loading/error/empty states. |
| Local Compose | implemented | `docker-compose.yml`, Web/Gateway Dockerfiles, `scripts/start-all.{ps1,sh}` | A disposable project with its own volume/network built and reached healthy state for all eight containers, including Web on host port 5173 and Gateway on 3000. The primary persistent volume was not touched. |
| Mobile | skeleton | `apps/mobile/App.tsx` | Expo shell only; no Phase 1 mobile implementation. |
| Deployment/cloud | planned | no deployment manifest outside local Compose | No cloud deployment, commit, push or external publish is part of this phase. |

## Phase 1 authentication behavior

`users`, `user_credentials`, `user_sessions` and `password_reset_tokens` are
Core-owned migration-009 tables. Registration atomically creates the user,
Argon2id password hash and initial refresh-token generation. Access JWTs are
issued/verified with `jsonwebtoken`, constraining algorithm, signature,
issuer/audience, expiry and the bound identity/session claims. The Web keeps
the access JWT in memory only.

Refresh tokens are opaque 48-byte random values. Only SHA-256 hashes persist;
the raw value is an HttpOnly, SameSite=Lax cookie scoped to `/api/v1/auth` and
is Secure in production. Refresh rotation consumes one generation and writes
the next. A replay revokes the whole family. Login failures avoid account
enumeration, session actions are actor scoped, password changes/resets revoke
all sessions and auth-relevant actions are audit recorded without raw secrets.

Credentialed browser operations validate configured Origin/Referer evidence in
addition to the exact CORS allowlist. Development/test demo auth remains
explicit compatibility behavior; environment validation rejects it in
production.

## Web architecture

The Web is a single Next.js App Router application with server layouts/pages
and small client islands only where browser state is needed: navigation,
Motion visuals, auth bootstrap, forms, route gates and chat interaction. It
uses `next/link` and `next/navigation`; React Router, Vite runtime files and a
second frontend are absent. The accessible root has route-level loading,
error and not-found states. The static landing contains exactly the four
current service categories: Food, Ride, Restaurant and Healthcare.

- apps/ contains deployable applications: the gateway and agent today, plus web/mobile shells. Future browser/mobile traffic still terminates at the gateway.
- services/ contains independently deployable domain owners. Each owns its persistence and API; api/ is the HTTP edge, application/ coordinates use cases, domain/ holds pure rules, and repositories/ is the persistence boundary. Current models/ directories contain API/schema placeholders, not database models.
- packages/contracts/ holds inter-service contracts: openapi/ for REST descriptions and tools/ for agent capability schemas. A tool schema is not a REST endpoint.
- packages/generated-ts-clients/ is generated from OpenAPI only; do not add business logic or hand-edit generated output.
- packages/shared-config/ is limited to small reference configuration such as currency, timezone, service type, and common error code - never ORM, database access, business logic, or secrets.
- infra/postgres/init/ is local PostgreSQL bootstrap only. It is not a service migration runner. Service-owned migrations/ and seeds/ run migration first, then deterministic seed data when those implementations exist.
- Root tests/ is reserved for cross-service unit/integration/contract/e2e/evaluation suites; live public E2E coverage is split between tests/e2e/test_food_vertical_slice.py, tests/e2e/test_four_domain_workflows.py, and tests/e2e/test_unified_assistant.py.
- services/healthcare-sandbox/ is the one directory under services/ that is not a deployable domain owner. It is an unwired standalone mock of an external clinic provider, absent from Compose and CI, and must not be treated as the Healthcare boundary.
- scripts/ mixes two unrelated concerns: platform helpers (start-all, setup-env, migrate, seed, dev, test, validate-env-config, check-migration-parity) and the course AI-usage logging tooling (log_*.py, submit_log.py, setup_hooks.*, _pyrun.*). The logging tooling is hook-managed; see [.agents/rules/ai-log-hook.md](../../.agents/rules/ai-log-hook.md).
- eval/ currently tracks only results/report.md. There is no evaluation runner in the repository, so any coverage/accuracy figure is `not measured` until one exists.
- presentation/ currently tracks only README.md. The pitch deck and demo video it describes are not in the repository.

The Web calls `NEXT_PUBLIC_API_URL` directly with `credentials: include`. There is no database access, service URL, secret or domain invariant in the frontend. `sessionStorage` is limited to transient current-tab assistant UI state; it never contains access/refresh credentials.

## Historical verification evidence - 2026-08-12

The following checks passed on this worktree:

| Service | Compose name | Host/container port in the checked example | Health endpoints |
| --- | --- | --- | --- |
| Web | web | `127.0.0.1:${WEB_PORT:-5173}:80` (host loopback only) | `/` (Nginx SPA) |
| Gateway | api-gateway | `${API_GATEWAY_PORT}:3000` | /health/live, /health/ready |
| Agent | agent-service | 8001, internal only — declares `expose: ["8001"]` | /health/live, /health/ready |
| Ride | ride-service | 8101, internal only — declares no `ports:` and no `expose:` | /health/live, /health/ready |
| Restaurant | restaurant-service | 8102, internal only — declares no `ports:` and no `expose:` | /health/live, /health/ready |
| Healthcare | healthcare-service | 8103, internal only — declares no `ports:` and no `expose:` | /health/live, /health/ready |
| Food | food-service | 8104, internal only — declares `expose: ["8104"]` | /health/live, /health/ready |
| PostgreSQL | postgres | `5432:5432` — the one backing service published to the host | container `pg_isready` |

Only `web`, `api-gateway`, and `postgres` declare `ports:`. The five internal services take their listening port from `SERVICE_PORT`, so the numbers above are the configured container ports, not host bindings; `expose:` is declarative documentation in Compose and its absence on Ride/Restaurant/Healthcare does not block container-to-container calls on the `xone_internal` network.

The checked launcher is the primary local path; it validates configuration, builds Compose, waits for PostgreSQL and every application health check, applies idempotent migrations, verifies Gateway readiness, and only then starts the Web dev server:

    ./scripts/start-all.ps1                 # add -SeedDemo for deterministic demo data
    ./scripts/start-all.sh                  # add --seed-demo for deterministic demo data

The individual steps the launcher composes are also runnable on their own:

    ./scripts/setup-env.ps1
    docker compose up --build
    python scripts/validate-env-config.py
    python scripts/check-migration-parity.py
    docker compose --env-file .env.example config --quiet
    ./scripts/migrate.ps1 .env.example
    ./scripts/seed.ps1 .env.example

The equivalent shell helpers are scripts/setup-env.sh, scripts/migrate.sh, and scripts/seed.sh; migration/seed helpers accept an optional env-file path as their first argument. `scripts/dev.{ps1,sh}` and `scripts/test.{ps1,sh}` are thin developer wrappers, and the root `package.json` exposes `build:gateway`, `test:gateway`, `check:agent`, `compose:config`, and `test:e2e`. Food and Gateway /health/ready report the database/worker dependencies they actually check; they are not a substitute for the full cross-service smoke flow.

## Verification observed in this audit

### BASE SUITES

For this evidence-only pass, the four required service commands and their collection commands were each run exactly once from the owning service directory. The exact stdout summaries were:

- Food (`services/food-service`): `python -m pytest tests -q` -> `22 passed, 3 skipped, 1 warning in 0.45s`; `python -m pytest tests --collect-only -q` -> `25 tests collected in 0.28s`.
- Ride (`services/ride-service`): `python -m pytest tests -q` -> `10 passed, 1 warning in 0.26s`; `python -m pytest tests --collect-only -q` -> `10 tests collected in 0.01s`.
- Restaurant (`services/restaurant-service`): `python -m pytest tests -q` -> `20 passed, 1 skipped, 1 warning in 1.15s`; `python -m pytest tests --collect-only -q` -> `21 tests collected in 0.80s`.
- Healthcare (`services/healthcare-service`): `python -m pytest tests -q` -> `21 passed, 1 skipped, 23 warnings in 0.94s`; `python -m pytest tests --collect-only -q` -> `22 tests collected in 0.60s`.

These are BASE SUITES counts only; Ruff, targeted PostgreSQL, public E2E, and live Gemini evidence are not added to them. Previously recorded Agent, Gateway, and Web checks remain separate and unchanged. No existing `p-018` volume was deleted.

Source reconciliation for that pass ran from the repository root at HEAD `6672e988c4cdd4de19a542a0ab4bacfbad216367` with the captured dirty working-tree status. Every collected service test source is tracked and inside the repository root; no untracked/ignored/outside-root test source contributes to the counts. The apparent `develop.xml` result `21/7/18/18` omitted the content blocks for the four tracked service `tests/test_config.py` files even though its directory index lists them. Those files contribute exactly Food `+4`, Ride `+3`, Restaurant `+3`, and Healthcare `+4`, yielding reproducible repository collection `25/10/21/22`. Exact node IDs and tracked-source proof are recorded in [Testing Strategy](../development/testing-strategy.md). No test was modified for reconciliation.

### TARGETED POSTGRESQL

Disposable PostgreSQL evidence passed Food `3/3` and Gateway Core `5/5`. These targeted counts are separate from BASE SUITES and are not summed into them. Core migrations 001-013 and deterministic seeds were applied only to the disposable acceptance project.

### DETERMINISTIC PUBLIC E2E

The public local E2E source collection command was run in this pass and collected exactly `31 tests`. The previously recorded deterministic disposable-stack runtime evidence remains `31 passed in 164.95s`, zero skipped; it is not rerun in this documentation-only pass. Its Ride recovery test executed two Gateway restarts, Ride/payment survival, same-key exact replay, and different-key rejection. The acceptance project was checked healthy afterward and its containers were disposable; Browser smoke remains `UNVERIFIED` because no browser-control instance was connected.

### LIVE GEMINI SMOKE

The user-authorized local Agent reported `model_mode=gemini`, `api_key_configured=true`, `last_model_call_status=success`, `last_model_used=gemini-3.5-flash-lite`, structured invocation, and no fallback. The public Agent contract returned HTTP 200 with `decision_source=model`; the forced fallback probe recovered on `gemini-3.1-flash-lite`; and the public Gateway Food two-turn smoke returned HTTP 201 twice. Five demo-critical flows were run once each: Food full ordering passed after correcting the disposable Agent container's internal Gateway URL; Restaurant explicit-confirmation passed; Healthcare symptom flow had one assertion-only first-step mismatch (category C, no state/action bug); Healthcare-to-Ride authoritative handoff passed; and Food/Healthcare ambiguity clarification passed. The live demo set is therefore `4/5` assertion passes, with the remaining failure accepted as model-wording/assertion nondeterminism under the test policy.

The prior live-provider run remains separate from deterministic acceptance: `25 passed, 6 failed`, classified as `3 B/transient` and `3 C/assertion-only`; no failure was classified D or E. Safe classification of the six failures is recorded in `docs/development/testing-strategy.md` and `job.txt`; the prior output did not capture `decision_source`, `last_model_used`, or fallback state, so those fields remain `not captured` rather than inferred. `llm.py` omits `temperature`, `top_p`, and `top_k` for every Gemini 3 name, including an optional `models/` prefix, and the Restaurant adapter uses the shared `build_chat_model` path. No key, raw prompt, authorization header, or provider payload was printed.

## Static, security, and boundaries

- `python -m compileall -q apps/agent-service/src services scripts`, `python scripts/check-migration-parity.py` (`24 files`), `python scripts/validate-env-config.py` (`81 root variables, 77 Compose variables`), `docker compose --env-file .env.example config --quiet`, `bash -n scripts/start-all.sh`, `bash scripts/tests/test-start-all-host-normalization.sh`, and `git diff --check` all passed. The diff check emitted only existing LF/CRLF warnings.
- Direct Git inspection listed tracked `.github/workflows/ci-cd.yml`, `pnpm-lock.yaml`, and `apps/web/package-lock.json`; the current workflow runs Agent/Ride/Restaurant/Healthcare/Food lint and tests in service-specific jobs, while Gateway uses frozen pnpm install and Web uses `npm ci`. The workflow still runs Ruff and pytest for all five Python service owners, plus the dedicated integration/build jobs. Frozen Gateway install and Web `npm ci` both passed; lockfiles were not regenerated.
- `npm audit --json` and `npm audit --omit=dev --json` each reported one high advisory: transitive `nanoid@3.3.16` via `vite@6.4.3 -> postcss@8.5.25`, affected `<3.3.17`, `fixAvailable=true`; patched `3.3.17`/`3.3.18` fit the existing `^3.3.16` range. The omit-dev result remains nonzero because Vite is manifest-classified as a production dependency. Deployment inspection classifies the chain as build tooling only: Vite runs only in the Docker builder, the final image is static Nginx output, source/dist contain no Nanoid/PostCSS/custom-generator code, and PostCSS calls `nanoid(6)`, not the vulnerable zero-size path. It is not shipped or exploitable in the deployed browser runtime; no dependency change was made. Full details are in [Testing Strategy](../development/testing-strategy.md).
- `.gemini/settings.json` contains only the `STITCH_API_KEY` environment expansion; no literal credential was printed or used. `apps/agent-service/src/agents/tools/medical_tools.py` remains absent, and Web/Agent boundary scans found no direct internal service calls.
- Browser smoke: `UNVERIFIED`.

SECURITY ACTION REQUIRED BY USER: revoke/rotate the previously exposed Stitch API key.

## Change rules derived from the current state

Business API changes must add a versioned OpenAPI contract, any needed generated client, API/contract tests, and matching documentation. A schema change needs an owned migration before an optional deterministic seed, plus data-architecture and test updates. Food order placement and cancellation remain separate confirmation actions; final execution revalidates authoritative Food state.

## Incremental delivery guidance

Implement one walking vertical slice at a time: user request -> gateway -> agent intent/tool selection -> provider lookup -> draft/quote -> user confirmation -> domain booking creation -> structured result. This is a target sequence, not a running flow. Add confirmation, idempotency, and audit before its important side effects; a target box does not need to become a separate physical service/database before the first end-to-end slice is complete.

## Current verification evidence - 2026-08-16

- Direct local runtime health passed for Gateway, Web, Agent, Ride, Restaurant, Healthcare and Food; additive seed and scoped reset checks preserved the PostgreSQL volume and imported catalogs.
- Contract/DataOps tests passed (`8` tests), migration parity passed (`24` files), and the latest Gateway/Web/Python checks passed: Gateway `25` suites, `108` passed and `7` skipped (`115` total); Web `13` suites / `52` tests; Agent `106`; Food `23` / `3` skipped; Ride `19`; Restaurant `21` / `1` skipped; Healthcare `25` / `1` skipped. Ruff, typecheck, build and lint passed in their applicable scopes.
- Playwright Chromium passed `27/27` responsive tests at 375x812, 768x1024 and 1440x1000; live Product `2/2`, Admin `1/1`, and the real transaction flow `1/1` passed with browser error listeners.
- The 2026-08-16 isolated Gate G2 run provides the first private-key Gemini evidence; the legacy `tests/e2e` batch is still not counted as acceptance evidence because it hit the intentionally bounded process-local login limiter and includes slow Assistant scenarios.
