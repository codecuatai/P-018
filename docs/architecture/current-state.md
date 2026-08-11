# Current Architecture State

This is the canonical, filesystem-backed status for X-One as of 2026-08-11.
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
| Web | implemented | `apps/web/src/app/`, `src/components/marketing/`, `src/features/`, `src/providers/auth-provider.tsx`, `src/lib/api-client.ts` | Next.js App Router provides landing, auth, app/admin route guards and product shells. Conversation history, saved addresses and service-specific CRUD remain honest planned states rather than fabricated browser data. |
| Web UI system | implemented | `docs/design-system.md`, `docs/motion-system.md`, `apps/web/src/styles.css`, `globals.css`, `motion/react` components | Optional hero video is configuration-only; no video asset is bundled. The map is explicitly an illustration, not live tracking. |
| Gateway real authentication | implemented | `apps/api-gateway/src/modules/auth/`, migration `009_core_auth.sql`, `gateway-auth-v1.yaml` | Password-reset email delivery is a deliberate future seam. Test-only reset capture is rejected in production and not rendered by the Web. |
| Core persistence | implemented | `apps/api-gateway/src/modules/core/`, `migrations/001`--`009` | Runtime uses PostgreSQL; in-memory Core/Auth repositories are test adapters only. |
| Unified assistant | implemented | `apps/api-gateway/src/modules/conversation/`, `apps/web/src/features/assistant/` | Existing Food/Ride/Restaurant/Healthcare authority and confirmation boundaries are preserved; no Phase 2 domain expansion was added. |
| Product routes | implemented/skeleton | `apps/web/src/app/app/`, `apps/web/src/app/admin/` | `/app`, conversation/history IDs, services, profile, addresses, settings and `/admin` route correctly. Profile/settings make real Gateway calls; address/history/service administration are labeled planned where no backend capability exists. |
| Local Compose | implemented, runtime verification pending | `docker-compose.yml`, Web/Gateway Dockerfiles, `scripts/start-all.{ps1,sh}` | Compose publishes Web and Gateway; actual disposable-stack evidence is recorded only after a fresh run. |
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

The following Phase 1 checks passed on this worktree:

- Environment and Compose: `python scripts/validate-env-config.py` reported
  `99` root variables and `95` Compose variables; `docker compose --env-file
  .env.example config --quiet` passed; migration parity reported `16` files.
- Gateway: frozen install, lint, Jest and build passed. Jest reported `20`
  passing suites and `82 passed, 7 skipped, 89 total` tests.
- Web: frozen install, lint, typecheck, Jest and `next build` passed. Jest
  reported `4` suites / `6` tests; the build generated `15` route entries.
- Python services: Agent `103 passed`; Ride `10 passed`; Restaurant `20
  passed, 1 skipped`; Healthcare `21 passed, 1 skipped`; Food `22 passed, 3
  skipped`. Ruff passed for all five service scopes.
- A fresh disposable Compose project
  `xone-phase1-20260811-005855` reached eight healthy containers. Owned
  migrations passed twice, and isolated Core/Auth PostgreSQL tests passed with
  `2` suites / `7` tests. The project and its newly created volume were removed
  afterward; no existing persistent volume was touched.
- Direct runtime HTTP acceptance passed for registration, refresh, logout,
  login, session listing, logout-all, old-access invalidation and Web health.
  Fourteen routed Web pages returned HTTP `200`, and the landing page rendered
  through SSR.

Interactive browser acceptance remains **UNVERIFIED**. The environment exposed
no browser binding, so screenshots, responsive visual review and browser-console
evidence were not fabricated or treated as passing evidence.
