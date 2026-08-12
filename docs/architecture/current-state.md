# Current Architecture State

This is the canonical, filesystem-backed status for X-One as of 2026-08-12.
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

For the final corrective pass, capability and acceptance labels use the
following explicit vocabulary where applicable: `IMPLEMENTED_RUNTIME`,
`IMPLEMENTED_AGENT_TOOL`, `IMPLEMENTED_GATEWAY_ACTION`,
`IMPLEMENTED_DOMAIN_API`, `LEGACY_COMPAT`, `DEPRECATED`, and
`BROWSER_ACCEPTANCE_PENDING`.

The implementation/runtime evidence below is not a claim that the strict
work.md Phase 1-9 final gates are complete: those gates require browser E2E,
and the current browser runtime exposes zero backends.

## Runtime and ownership

Web and mobile call only the NestJS Gateway. The Next.js Web's `/api/health`
is a technical Docker probe only; it is not a BFF, domain proxy or authority.
The Gateway validates public requests, routes typed internal clients and owns
Core audit/idempotency/session evidence, but never writes a domain's data by
cross-domain SQL. The Agent emits validated typed requests only and does not
make a booking, payment or database call. Restaurant owns dine-in
reservations; Food owns menus, food orders and delivery ordering.

One physical PostgreSQL instance contains separate logical databases/owners:
Core `xone_core`, Agent `xone_agent`, Ride `xone_ride`, Restaurant
`xone_restaurant`, Healthcare `xone_healthcare` and Food `xone_food`.
Cross-database queries, foreign keys, shared ORM models and shared domain
business logic are prohibited.

## Observed implementation matrix

| Component | Status | Evidence | Current limitation |
| --- | --- | --- | --- |
| Web | implemented | `apps/web/src/app/`, `src/components/marketing/`, `src/features/`, `src/providers/auth-provider.tsx`, `src/lib/api-client.ts` | Next.js App Router provides landing, auth, resumable onboarding, app/admin route guards, persistent conversations/history, saved-address CRUD, Service Hub browse/action states, map/location and Ride tracking states. Jest (13 suites/50 tests), typecheck and build pass; Playwright is `BROWSER_ACCEPTANCE_PENDING` because Chromium is unavailable. |
| Web UI system | implemented | `docs/design-system.md`, `docs/motion-system.md`, `apps/web/src/app/globals.css`, `apps/web/src/styles/`, `apps/web/src/components/marketing/*.module.css`, `motion/react` components | Calm task-first Vietnamese UI has route loading/error/empty/disabled states, reduced-motion handling, responsive shells, location/map panels, and tracking polling. The map is a deterministic visual snapshot, not a claim of a production map provider. |
| Gateway real authentication | implemented | `apps/api-gateway/src/modules/auth/`, migration `009_core_auth.sql`, `gateway-auth-v1.yaml` | Password-reset email delivery is a deliberate future seam. Test-only reset capture is rejected in production and not rendered by the Web. |
| Core persistence | implemented | `apps/api-gateway/src/modules/core/`, `migrations/001`--`011` | Runtime uses PostgreSQL; in-memory Core/Auth repositories are deterministic test adapters. Core now persists profile context, saved addresses, conversation metadata and multi-service plans with idempotency evidence. |
| Unified assistant | implemented | `apps/api-gateway/src/modules/conversation/`, `apps/web/src/features/assistant/` | Existing Food/Ride/Restaurant/Healthcare authority and two-step confirmation boundaries are preserved; durable conversation data is Core-owned and model output remains typed/untrusted. Service Hub direct browse/action routes use the same typed clients and confirmation/idempotency boundaries. |
| Ride lifecycle | implemented | `services/ride-service/src/domain/ride.py`, `src/application/ride_service.py`, `src/infrastructure/models.py`, migration `20260812_0003_ride_lifecycle.py`, `apps/api-gateway/src/modules/conversation/ride-conversation.service.ts` | `IMPLEMENTED_RUNTIME`: DB tariff/driver lookup, quote expiry/consumption, two confirmations, persisted booking transitions, tracking events, idempotent replay, and actor-scoped history. Disposable HTTP proof observed `AWAITING_CONFIRMATION → SEARCHING_DRIVER → DRIVER_ASSIGNED → DRIVER_TO_PICKUP → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED`. |
| Tool Registry / Agent parity | implemented | `apps/api-gateway/src/modules/tools/tool-registry.ts`, `packages/contracts/tools/tool-registry-v2.json`, `apps/agent-service/tests/test_agents/test_tool_registry_parity.py` | Version-2 inventory has 46 canonical entries: 23 `IMPLEMENTED_AGENT_TOOL`, 12 `IMPLEMENTED_GATEWAY_ACTION`, and 11 `IMPLEMENTED_DOMAIN_API`. Legacy Agent aliases remain `LEGACY_COMPAT`; the Agent never executes final side effects. |
| Service Hub/history/location/patient context | implemented | `apps/api-gateway/src/modules/services/`, `history/`, `personal/`, `apps/web/src/app/app/services/`, `history/`, `addresses/`, `patients/` | Gateway aggregates typed domain reads with partial/degraded responses; Core owns saved addresses, Healthcare owns patient links, and the location provider is optional with a labeled deterministic fallback. |
| Catalog data pipeline | implemented | `scripts/data_pipeline.py`, `scripts/dataops/catalog_import.py`, `data/**`, additive Food/Restaurant/Healthcare provenance migrations | Dry-run and two idempotent applies on a disposable Compose PostgreSQL stack imported Food `17,596`, Restaurant `1,307`, and Healthcare `281` normalized records with zero rejected rows. Active dataset versions and representative DB counts were read back; the malformed specialty source is repaired into derived output with `70` reported repairs, never rewritten in place. |
| Recommendation + multi-service reliability | implemented | `apps/api-gateway/src/modules/workflow/multi-service-reliability.ts`, `reliability.module.ts`, `conversation/orchestration.ts`, Core migration `011`, tests | Deterministic ranking, owning-service resource re-read, dependency/partial-success/compensation semantics, step idempotency, and durable plan readback are wired. Route-provider ETA is available for explicit routes/quotes; browser E2E remains unverified. |
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

## Current verification evidence

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

Interactive browser visual acceptance is **UNAVAILABLE IN THIS ENVIRONMENT**: browser bootstrap troubleshooting was checked, the integrated browser runtime reported zero available backends, and the optional `agent-browser` CLI is not installed. No screenshot/console run is claimed; Web build, automated tests, healthy Compose, and authenticated Gateway HTTP evidence are the current evidence.
