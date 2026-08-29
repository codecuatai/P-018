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
python scripts/quality/validate-env-config.py
docker compose --env-file .env.example config --quiet
python scripts/database/check-migration-parity.py

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

The Auth PostgreSQL test applies the Core migrations it needs through `011_core_multi_service_workflows.sql`;
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

The list command reports `27 tests (9 scenarios x 3 viewports)`. The following
execution note is historical (2026-08-12); current browser evidence is recorded
in the 2026-08-13 section below.

Historical execution was attempted with:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://localhost:5173'
corepack pnpm --dir apps/web exec playwright test --project=chromium-375
```

At that historical run, all 9 selected tests stopped before navigation because
`C:\Users\ADMIN\AppData\Local\ms-playwright\chromium_headless_shell-1161\chrome-win\headless_shell.exe`
does not exist. Therefore browser status is
`BROWSER_ACCEPTANCE_PENDING` / `BLOCKED_BY_ENVIRONMENT`; no screenshot,
responsive interaction, or browser-console result is counted.

## Historical final corrective-pass evidence - 2026-08-12

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

## Current local completion evidence - 2026-08-13

- Direct-process runtime: `local-dev.ps1`, `local-health.ps1`, additive
  `seed-local.ps1` and scoped dry-run `demo-reset.ps1` were exercised against
  the existing PostgreSQL container. All seven application health checks were
  `PASS`.
- Web fast browser suite: Playwright Chromium ran serially with 27/27 passed
  at 375x812, 768x1024 and 1440x1000. The live Product suite was 2/2, Admin
  was 1/1, and the real transaction suite was 1/1. Page errors, console
  errors and non-aborted failed requests were treated as failures.
- The optional `agent-browser` CLI is not installed; Playwright Chromium was
  used for the actual browser evidence. No browser pass is claimed from a
  test listing alone.
- Real live transaction coverage exercised Food, Ride tracking, Restaurant,
  Healthcare, history/reorder/feedback and notifications through the Gateway
  and domain services without mocks.
- A local performance smoke with 10 samples per read endpoint recorded p50,
  p95 and max for Gateway health, Food/Restaurant/Healthcare search, history,
  Admin dashboard and Ride tracking; auth login used 3 samples because the
  local login limiter is intentionally bounded.
- Gemini remains intentionally unverified because no key is configured. Token
  reuse caching is provided in `tests/e2e` to prevent login rate limiting.

## Cross-service Compose layer - `tests/e2e`

`tests/e2e` exercises the real Gateway together with Agent, Ride, Restaurant,
Healthcare and Food over HTTP, and reaches into the stack with `docker compose
exec`/`restart` to assert persistence, hold expiry reconciliation and
idempotent replay across a Gateway restart. It requires Docker Compose and
cannot run against the direct-process runtime.

Invoke it with `python -m pytest tests/e2e -q` or
`corepack pnpm test:e2e:crossservice` from the root workspace. The root
`test:e2e` alias is retained for compatibility; the Playwright browser suite
remains `pnpm --dir apps/web test:e2e`.

`scripts/local/local-acceptance.ps1` runs this suite as a mandatory step. It
derives the Gateway URL, Compose project/env file and demo credentials from
the acceptance env file and sets `E2E_REQUIRE_GATEWAY=1`. The suite-level pytest
hook rejects a missing Gateway URL, and the acceptance script throws when the
Compose stack is incomplete. `-SkipCrossServiceE2E` remains available for a
deliberate partial run and prints an explicit `UNVERIFIED` line.

Shared fixtures live in `tests/e2e/_helpers.py` and are imported absolutely
(`from _helpers import ...`) because `tests/e2e` has no `__init__.py`. The
helper owns the access-token cache that keeps a full-suite run inside the
Gateway's per-IP login limiter.
