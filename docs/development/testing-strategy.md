# Testing Strategy

Tests prove one behaviour at the boundary that owns it. Unit tests use
deterministic adapters and fake LLMs; they do not call Gemini, a live payment
provider or a live domain system. Contract tests protect public envelopes and
typed service boundaries. PostgreSQL tests run only against an explicitly
provided disposable target. Browser acceptance is recorded only after an
actual browser run.

## Phase 2–9 required checks

Run the changed-scope checks before handoff:

```powershell
python scripts/validate-env-config.py
docker compose --env-file .env.example config --quiet
python scripts/check-migration-parity.py

corepack pnpm --dir apps/api-gateway install --frozen-lockfile
corepack pnpm --dir apps/api-gateway run lint
corepack pnpm --dir apps/api-gateway test
corepack pnpm --dir apps/api-gateway run build

corepack pnpm --dir apps/web install --frozen-lockfile
corepack pnpm --dir apps/web run lint
corepack pnpm --dir apps/web run typecheck
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web run build
```

The Web suite covers memory-only access-token behaviour, one shared refresh
for concurrent protected requests, auth-provider restoration/failure,
registration validation and one reduced-motion hero path. Gateway unit/HTTP
tests cover Argon2id policy, same-safe login failures, maintained-library JWT
claims/algorithm restriction, cookie attributes, origin validation, rotation,
family-reuse invalidation, actor-scoped sessions, password change and reset.

For Core/Auth persistence, provide the same disposable PostgreSQL URL to both
variables:

```powershell
$env:CORE_TEST_DATABASE_URL = 'postgresql://.../xone_core'
$env:AUTH_TEST_DATABASE_URL = $env:CORE_TEST_DATABASE_URL
corepack pnpm --dir apps/api-gateway test -- --runInBand test/core.postgres.integration.spec.ts test/auth.postgres.integration.spec.ts
```

The Auth PostgreSQL test applies owned migrations through `011_core_multi_service_workflows.sql`,
then proves the atomic registration rows, Argon2id/hash-only storage, rotation
replay revocation, one-time reset hash and session invalidation. It must never
target a user-owned volume.

## CI

CI installs Gateway and Web dependencies with the root frozen pnpm lockfile.
The Web job runs lint, typecheck, Jest and `next build`. The PostgreSQL job runs
both Core and Auth integration suites against GitHub Actions' disposable
PostgreSQL service. Compose validation builds the Gateway, Web, Agent and Food
images.

## Browser and disposable-stack acceptance

Create a uniquely named disposable Compose project; do not reuse or delete the
developer's normal project/volume. Run owned migrations, then test the public
Web/Gateway flow: landing at 320px and desktop widths, register, refresh,
logout/login, settings/session action, and a reduced-motion rendering path.
Record a check as **PASS** only with its observed result. If browser automation
is unavailable, record it as **UNVERIFIED**, not passed.

## Playwright harness

The Web owns a single Playwright setup in `apps/web/playwright.config.ts`.
It uses Chromium projects at 375x812, 768x1024 and 1440x1000, starts or reuses
the Web dev server, and retains trace/screenshot/video only on failure. The
three spec files cover 9 scenarios:

- `e2e/auth-onboarding.spec.ts`: registration, onboarding denial, saved
  address, logout/login persistence, and explicit location denial.
- `e2e/conversations.spec.ts`: create/send/rename/archive/unarchive/reload/
  delete with actor-scoped Gateway routes.
- `e2e/service-flows.spec.ts`: Food, Ride lifecycle/two confirmations,
  Restaurant, Healthcare, Healthcare-plus-Ride partial success, and
  cross-user denial.

Browser-independent validation:

```powershell
corepack pnpm --dir apps/web exec playwright test --list
corepack pnpm --dir apps/web exec tsc --noEmit
```

The list command reports `27 tests (9 scenarios x 3 viewports)`. Execution was
attempted with:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://localhost:5173'
corepack pnpm --dir apps/web exec playwright test --project=chromium-375
```

All 9 selected tests stopped before navigation because
`C:\Users\ADMIN\AppData\Local\ms-playwright\chromium_headless_shell-1161\chrome-win\headless_shell.exe`
does not exist. Therefore browser status is
`BROWSER_ACCEPTANCE_PENDING` / `BLOCKED_BY_ENVIRONMENT`; no screenshot,
responsive interaction, or browser-console result is counted.

## Current final corrective-pass evidence — 2026-08-12

- Environment/config: `101` root variables / `97` Compose variables;
  Compose config and migration parity (`22` paths) passed.
- Gateway: lint, typecheck, Jest and build passed; `24` suites passed, `2`
  skipped; `103 passed, 7 skipped, 110 total` tests.
- Web: typecheck, Jest and `next build` passed; `13` suites / `50` tests and
  `19` App Router entries. Leaflet map fallback/invalid-coordinate tests pass.
- Python: Agent `106 passed`; Ride `16 passed`; Restaurant `21 passed, 1
  skipped`; Healthcare `25 passed, 1 skipped`; Food `23 passed, 3 skipped`.
  Ruff passed in every relevant service scope.
- Contracts/DataOps: shared contract `2 passed`, service contract parity `9
  passed`, and DataOps importer tests `6 passed`.
- Disposable runtime: Compose project `p018_acceptance_20260812` had all 8
  containers healthy; Gateway `/health/ready` and Web `/api/health` returned
  200. The isolated catalog apply/read-back counts were Food `17,596`,
  Restaurant `1,307`, Healthcare facilities `3` / departments `72` /
  doctors `208`; no primary volume was touched.
- Live HTTP acceptance passed authenticated persistence (register/profile/
  address/conversation/logout/login), Food order/payment/replay/tracking,
  Ride quote/two-confirmation/tracking/history, Restaurant hold/confirmation,
  Healthcare hold/payment/confirmation, and multi-service dependency,
  partial-success, idempotency and cross-user cases.
- Gemini smoke is `BLOCKED`: no key is configured. No key or secret was read,
  printed, copied or changed.
