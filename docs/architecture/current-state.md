# Current Architecture State

This is the canonical, filesystem-backed status for X-One as of 2026-08-20.
It supersedes earlier Phase 0 descriptions that referred to a Vite Web demo or
demo-only public authentication. Historic work evidence belongs in
`WORKLOG.md`; it is not a claim about the current implementation.

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

## Core Agent remediation evidence - 2026-08-20

- Agent startup no longer creates tables and required PostgreSQL mode has no
  silent memory fallback. Readiness checks the owned migration explicitly.
- Food cart and voucher writes require an idempotency key and the Food-owned
  transaction ledger enforces exact replay, changed-payload conflict, actor
  scope and one logical mutation.
- The Agent-side Gateway execution client and the HTTP
  `/internal/tools/execute` endpoint were removed. Food execution now crosses
  the typed Gateway proposal validator. Agent `tool_call_id` values are trace
  references only; Gateway derives the write idempotency key from the trusted
  actor, persisted task revision, capability, and bounded proposal index.
- Gateway consumes Core A capability metadata and authoritative fact
  projections, rejects schema/risk/gate/authority mismatch, and records the
  validated capability used for dispatch. Model-visible projections exclude
  authoritative IDs.
- The handoff now carries `core-a.v1` plus capability-catalog version. Gateway
  consumes blocked/failed dispositions and bounded re-plan directives, keeps
  unchanged same-key retries on the same revision, and removes stale pending
  confirmation evidence/actions/cards when terms change. Dispatch trace tests
  cover all four domains. Gateway now requires `planning_decision`,
  `core-a.v1`, and the exact observed capability-catalog version on every turn;
  absent, partially versioned, unversioned, or mismatched handoffs fail closed.
- Restaurant availability returns a 30-second authoritative snapshot with a
  distinct `snapshot_id`, `resource_version`, `observed_at`, and `expires_at`.
  Core A does not treat freshness-required authority without a future expiry as
  usable.
- Restaurant model extraction uses an `extra=forbid` semantic schema.
  Vietnamese confirmation parsing rejects negation, questions, correction and
  ambiguous substring matches. Actor-scoped Agent routes require constant-time
  internal authentication plus `X-Actor-Id`.
- The fake SSE endpoint and full-graph third-party callback remain removed.
  A privacy-reviewed Langfuse v4 adapter now emits manual, metadata-only spans
  for the Assistant run, validation, planner/model/Core A/task decisions,
  composition, fallback and run-metadata persistence. Strict Pydantic
  envelopes, SDK-only export filtering and export-stage masking exclude
  input/output, prompts, messages, graph state, slots, authoritative data,
  identities, secrets and hidden reasoning. Missing keys select a no-op
  adapter; exporter failure is non-authoritative.
- Agent run metadata now uses stable route/phase-scoped run identifiers, so a
  single Gateway correlation chain can plan, execute Food, and compose without
  a false `RUN_METADATA_CONFLICT`. Ride interpretation also receives the
  required actor assertion through the typed Agent client.

Local remediation verification passed Agent `196` tests (`1` PostgreSQL test
skipped), Gateway `176` tests (`7` PostgreSQL/integration tests skipped),
Restaurant `22` tests (`1` skipped), Food `38` tests (`3` PostgreSQL tests
skipped), plus Ride `31` tests. Gateway lint/build, Ruff,
environment validation (`123` root / `115` Compose variables), migration parity
(`28` files), Compose rendering, contract parity, and OpenAPI YAML parsing
passed. The sanitized evidence report is
[`eval/results/core-agent-remediation-2026-08-20.md`](../../eval/results/core-agent-remediation-2026-08-20.md).
Langfuse tracing also passed a live synthetic Agent run against the configured
US endpoint: the private trace contained the six expected run, validation,
model, planner, Core A and task observations, recorded provider token usage,
and exposed no input/output, prompt, user/session identity or raw error text.
See
[`eval/results/core-agent-langfuse-tracing-2026-08-20.md`](../../eval/results/core-agent-langfuse-tracing-2026-08-20.md).
The Agent image was rebuilt with Langfuse `4.14.4`, and the Gateway image was
rebuilt with the null re-plan directive compatibility fix. Only
`agent-service` and `api-gateway` were recreated with `--no-deps`; no database,
domain service, or volume was restarted or removed. The live synthetic trace
used the rebuilt Agent container.
Live PostgreSQL restart/outage, provider 20-case, cross-service E2E, and rollback
exercise remain explicitly blocked; this worktree is not certified 10/10 until
those gates run successfully.

## Observed implementation matrix

| Component | Status | Evidence | Current limitation |
| --- | --- | --- | --- |
| Web | implemented | `apps/web/src/app/`, `src/components/marketing/`, `src/features/`, `src/providers/auth-provider.tsx`, `src/lib/api-client.ts` | Next.js App Router provides landing, auth, resumable onboarding, app/admin route guards, persistent conversations/history, saved-address CRUD, Service Hub browse/action states, map/location and Ride tracking states. Jest (13 suites/52 tests), typecheck/build pass; Playwright Chromium 27/27 responsive and live Product/Admin/transaction suites pass. |
| Web UI system | implemented | `docs/design-system.md`, `docs/motion-system.md`, `apps/web/src/app/globals.css`, `apps/web/src/styles/`, `apps/web/src/components/marketing/*.module.css`, `motion/react` components | Calm task-first Vietnamese UI has route loading/error/empty/disabled states, reduced-motion handling, responsive shells, location/map panels, and tracking polling. The map is a deterministic visual snapshot, not a claim of a production map provider. |
| Gateway real authentication | implemented | `apps/api-gateway/src/modules/auth/`, migration `009_core_auth.sql`, `gateway-auth-v1.yaml` | Password-reset email delivery is a deliberate future seam. Test-only reset capture is rejected in production and not rendered by the Web. |
| Core persistence | implemented | `apps/api-gateway/src/modules/core/`, `migrations/001`--`011` | Runtime uses PostgreSQL; in-memory Core/Auth repositories are deterministic test adapters. Core now persists profile context, saved addresses, conversation metadata and multi-service plans with idempotency evidence. |
| Agent persistence | implemented | `apps/agent-service/migrations/002_agent_run_metadata.sql`, `src/application/run_metadata_store.py`, `src/infrastructure/database.py` | Production defaults to required PostgreSQL, performs no runtime DDL, and persists only allowlisted actor/workflow/run metadata, phase, capability names, latency and safe error code. The develop-branch `001_agent_workflow_states.sql` migration remains immutable history but has no runtime writer. Memory mode is explicit test/development configuration. Live PostgreSQL restart/reconnect acceptance remains unverified in this worktree. |
| Unified assistant | implemented | `apps/api-gateway/src/modules/conversation/`, `apps/web/src/features/assistant/` | Existing Food/Ride/Restaurant/Healthcare authority and two-step confirmation boundaries are preserved; durable conversation data is Core-owned and model output remains typed/untrusted. Service Hub direct browse/action routes use the same typed clients and confirmation/idempotency boundaries. |
| Ride lifecycle | implemented | `services/ride-service/src/domain/ride.py`, `src/application/ride_service.py`, `src/infrastructure/models.py`, migrations `20260812_0003_ride_lifecycle.py`, `20260816_0006_passenger_capacity.py`, and `20260827_0007_quote_snapshot.py`, `apps/api-gateway/src/modules/conversation/ride-conversation.service.ts` | `IMPLEMENTED_RUNTIME`: DB tariff/driver lookup, quote expiry/consumption, two confirmations, persisted booking transitions, immutable quote snapshot, tracking events, idempotent replay, and actor-scoped history. Targeted Ride tests and OpenAPI parity pass; migration apply/rollback and live Compose E2E remain environment-dependent verification items. Disposable HTTP proof observed `AWAITING_CONFIRMATION → SEARCHING_DRIVER → DRIVER_ASSIGNED → DRIVER_TO_PICKUP → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED`. |
| Tool Registry / Agent parity | implemented | `apps/api-gateway/src/modules/tools/tool-registry.ts`, `packages/contracts/tools/tool-registry-v2.json`, Gateway and Agent parity tests | Version-2 inventory has 46 canonical entries. Parity is checked in both directions; runtime-only compatibility names require a named owner and expiry. The Agent emits semantic typed proposals only and has no execution/domain client. |
| Service Hub/history/location/patient context | implemented | `apps/api-gateway/src/modules/services/`, `history/`, `personal/`, `apps/web/src/app/app/services/`, `history/`, `addresses/`, `patients/` | Gateway aggregates typed domain reads with partial/degraded responses; Core owns saved addresses, Healthcare owns patient links, and the location provider is optional with a labeled deterministic fallback. |
| Catalog data pipeline | implemented | `scripts/data_pipeline.py`, `scripts/dataops/catalog_import.py`, `data/**`, additive Food/Restaurant/Healthcare provenance migrations | Dry-run and two idempotent applies on a disposable Compose PostgreSQL stack imported Food `17,596`, Restaurant `1,307`, and Healthcare `281` normalized records with zero rejected rows. Active dataset versions and representative DB counts were read back; the malformed specialty source is repaired into derived output with `70` reported repairs, never rewritten in place. |
| Recommendation + multi-service reliability | implemented | `apps/api-gateway/src/modules/workflow/multi-service-reliability.ts`, `reliability.module.ts`, `conversation/orchestration.ts`, Core migration `011`, tests | Deterministic ranking, owning-service resource re-read, dependency/partial-success/compensation semantics, step idempotency, durable plan readback, and explicit activation of pending Ride quote steps are wired. Activation re-reads the Restaurant/Healthcare destination and requires a real route snapshot; final Ride booking still uses the existing explicit confirmation flow. |
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

The Web calls `NEXT_PUBLIC_API_URL` directly with `credentials: include`.
There is no database access, service URL, secret or domain invariant in the
frontend. `sessionStorage` is limited to transient current-tab assistant UI
state; it never contains access/refresh credentials.

## Historical verification evidence - 2026-08-12

The following checks passed on this worktree:

- Environment/Compose: `python scripts/validate-env-config.py`, `docker compose --env-file .env.example config --quiet`, and migration parity (`22` migration paths) passed.
- Gateway: lint, typecheck, Jest and build passed (`24` suites passed, `2` skipped; `103` passed, `7` skipped, `110` total).
- Web: typecheck, Jest and `next build` passed (`13` suites / `50` tests; 19 App Router entries). The Leaflet map is client-only and lazy-loaded, with deterministic route/location fallback states covered by unit tests.
- Python: Agent `106 passed`; Ride `16 passed`; Restaurant `21 passed, 1 skipped`; Healthcare `25 passed, 1 skipped`; Food `23 passed, 3 skipped`; Ruff passed for all service scopes.
- Contracts/DataOps: shared contract tests `2 passed`, service contract parity `9 passed`, and importer tests `6 passed`; read-only importer plans passed for Food `17,596`, Restaurant `1,307`, Healthcare `281` records. Healthcare reports `70` repaired specialty rows, `36` missing source URLs and `102` missing prices without fabricating values.
- Multi-service tests cover Restaurant→Ride dependency blocking, Healthcare→Ride partial success, independent Food/Healthcare continuation, idempotency conflict/replay, compensation safety, ranking, and Core-backed restart readback.
- A disposable Compose project (`p018_acceptance_20260812`) built the stack and reached healthy state for all eight containers. Real catalog rows were applied twice to its isolated PostgreSQL volume; read-back counts are Food `17,596`, Restaurant `1,307`, Healthcare `healthcare_facilities=3`, `departments=72`, `doctors=208`, each with one active dataset version. Gateway HTTP reads returned Food `8`, Restaurant `50`, and Healthcare `72` browse records from the imported sources. Auth/profile/address/conversation persistence, Food, Ride, Restaurant, Healthcare, and multi-service HTTP transactions passed, including cross-user denial and partial-success/dependency blocking. The project uses a separate volume/network and the primary persistent volume was not touched.
- The Healthcare facility lookup now accepts slash-bearing source IDs through the `{facility_source_id:path}` route; unit/contract checks pass and the disposable runtime was hot-patched for the HTTP proof. A reproducible image rebuild was blocked by an external PyPI timeout, not by a source/test failure.
- Playwright lists `27` tests across 375px, 768px and 1440px projects. Execution was attempted; all 9 tests in the 375px project stopped before launch because `C:\Users\ADMIN\AppData\Local\ms-playwright\chromium_headless_shell-1161\chrome-win\headless_shell.exe` is missing. No browser evidence is counted.
- Gemini smoke is `BLOCKED`: no Gemini key is configured in the current environment. No key was read, printed or changed.

Interactive browser visual acceptance was **UNAVAILABLE IN THAT HISTORICAL RUN**:
browser bootstrap troubleshooting reported zero available backends, and the
optional `agent-browser` CLI was not installed. The 2026-08-13 Playwright
Chromium run above is the current browser evidence.

## Current verification evidence - 2026-08-13

- Direct local runtime health passed for Gateway, Web, Agent, Ride, Restaurant,
  Healthcare and Food; additive seed and scoped reset checks preserved the
  PostgreSQL volume and imported catalogs.
- Contract/DataOps tests passed (`8` tests), migration parity passed (`24`
  files), and the latest Gateway/Web/Python checks passed: Gateway `25` suites,
  `108` passed and `7` skipped (`115` total); Web `13` suites / `52` tests;
  Agent `106`; Food `23` / `3` skipped; Ride `19`; Restaurant `21` / `1`
  skipped; Healthcare `25` / `1` skipped. Ruff, typecheck, build and lint
  passed in their applicable scopes.
- Playwright Chromium passed `27/27` responsive tests at 375x812, 768x1024
  and 1440x1000; live Product `2/2`, Admin `1/1`, and the real transaction
  flow `1/1` passed with browser error listeners.
- The 2026-08-16 isolated Gate G2 run provides the first private-key Gemini
  evidence. The `tests/e2e` batch was historically excluded from acceptance
  because it hit the intentionally bounded process-local login limiter and
  includes slow Assistant scenarios. As of 2026-08-28 it is a mandatory
  `local-acceptance.ps1` step again: `tests/e2e/_helpers.py` reuses one access
  token per base URL and user, so a full-suite run stays inside the limiter, and
  `E2E_REQUIRE_GATEWAY=1` turns a missing Gateway URL into a usage error instead
  of an all-skip pass. The step requires the Compose runtime and throws when the
  stack is incomplete; `-SkipCrossServiceE2E` prints an explicit `UNVERIFIED`
  line. It is still not wired into CI.
