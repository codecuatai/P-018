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
| Web | implemented | `apps/web/src/app/`, `src/components/marketing/`, `src/features/`, `src/providers/auth-provider.tsx`, `src/lib/api-client.ts` | Next.js App Router provides landing, auth, app/admin route guards, persistent conversations/history, saved-address CRUD, service browsing, map/location and Ride tracking states. Live browser visual acceptance remains unverified. |
| Web UI system | implemented | `docs/design-system.md`, `docs/motion-system.md`, `apps/web/src/app/globals.css`, `apps/web/src/styles/`, `apps/web/src/components/marketing/*.module.css`, `motion/react` components | Calm task-first Vietnamese UI has route loading/error/empty/disabled states, reduced-motion handling, responsive shells, location/map panels, and tracking polling. The map is a deterministic visual snapshot, not a claim of a production map provider. |
| Gateway real authentication | implemented | `apps/api-gateway/src/modules/auth/`, migration `009_core_auth.sql`, `gateway-auth-v1.yaml` | Password-reset email delivery is a deliberate future seam. Test-only reset capture is rejected in production and not rendered by the Web. |
| Core persistence | implemented | `apps/api-gateway/src/modules/core/`, `migrations/001`--`011` | Runtime uses PostgreSQL; in-memory Core/Auth repositories are deterministic test adapters. Core now persists profile context, saved addresses, conversation metadata and multi-service plans with idempotency evidence. |
| Unified assistant | implemented | `apps/api-gateway/src/modules/conversation/`, `apps/web/src/features/assistant/` | Existing Food/Ride/Restaurant/Healthcare authority and two-step confirmation boundaries are preserved; durable conversation data is Core-owned and model output remains typed/untrusted. |
| Service Hub/history/location/patient context | implemented | `apps/api-gateway/src/modules/services/`, `history/`, `personal/`, `apps/web/src/app/app/services/`, `history/`, `addresses/`, `patients/` | Gateway aggregates typed domain reads with partial/degraded responses; Core owns saved addresses, Healthcare owns patient links, and the location provider is optional with a labeled deterministic fallback. |
| Catalog data pipeline | implemented, apply unverified | `scripts/data_pipeline.py`, `scripts/dataops/catalog_import.py`, `data/**`, additive Food/Restaurant/Healthcare provenance migrations | Read-only plans validate Food `17,596`, Restaurant `1,307`, Healthcare `281` normalized records; the malformed specialty source is repaired into derived output with `70` reported repairs, never rewritten in place. Explicit `--apply` remains operator-controlled and no database apply is claimed here. |
| Recommendation + multi-service reliability | implemented | `apps/api-gateway/src/modules/workflow/multi-service-reliability.ts`, `reliability.module.ts`, `conversation/orchestration.ts`, Core migration `011`, tests | Deterministic ranking, owning-service resource re-read, dependency/partial-success/compensation semantics, step idempotency, and durable plan readback are wired. Route-provider ETA is available for explicit routes/quotes; browser E2E remains unverified. |
| Product routes | implemented | `apps/web/src/app/app/`, `apps/web/src/app/admin/` | `/app`, conversations, history/detail, services/browse, profile, addresses, settings and `/admin` routes build with route-level loading/error/empty states. |
| Local Compose | implemented, runtime partially verified | `docker-compose.yml`, Web/Gateway Dockerfiles, `scripts/start-all.{ps1,sh}` | Images/PostgreSQL/Gateway reached healthy state in the disposable attempt, but Web could not bind host port 5173 because it was already occupied; full-stack runtime remains unverified. |
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
- Gateway: lint, Jest and build passed after Phase 9 (`24` suites passed, `2` skipped; `101 passed, 7 skipped, 108 total`).
- Web: typecheck, Jest and `next build` passed (`12` suites / `46` tests; 19 App Router entries).
- Python: Agent baseline passed; Ride `14 passed`, Restaurant `20 passed/1 skipped`, Healthcare `25 passed/1 skipped`, Food `23 passed/3 skipped`; Ruff passed for all service scopes after the new contract test.
- Data: `python -m pytest -q scripts/dataops tests/data` passed (`9` tests); read-only importer plans passed for Food `17,596`, Restaurant `1,307`, Healthcare `281` records. Healthcare reports `70` repaired specialty rows, `36` missing source URLs and `102` missing prices without fabricating values.
- Multi-service tests cover Restaurant→Ride dependency blocking, Healthcare→Ride partial success, independent Food/Healthcare continuation, idempotency conflict/replay, compensation safety, ranking, and Core-backed restart readback.
- A disposable Compose attempt built the stack and reached healthy PostgreSQL/Gateway state, but Web host port `5173` was already in use; the project was stopped without deleting its persistent volume. Full Compose acceptance is therefore **PARTIAL/UNVERIFIED**.

Interactive browser visual acceptance remains **UNVERIFIED**. No browser screenshot/console run was used as evidence; the Web build and automated tests are the current evidence.
