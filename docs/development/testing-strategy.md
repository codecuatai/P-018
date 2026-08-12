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

## Current Phase 9 evidence

The final verification run for this worktree passed the following gates:

- Environment validation: `101` root variables / `97` Compose variables;
  Compose config passed; migration parity passed with `22` paths.
- Gateway: lint, Jest and build passed; Jest reported `24` passing suites,
  `101 passed, 7 skipped, 108 total` tests, including runtime dependency and
  partial-success acceptance.
- Web: typecheck, Jest and `next build` passed; Jest reported `12` suites / `46`
  tests and the build generated `19` App Router entries.
- Python: Agent baseline passed; Ride `14 passed`; Restaurant `20 passed, 1
  skipped`; Healthcare `23 passed, 1 skipped`; Food `23 passed, 3 skipped`.
  Ruff passed in all relevant service scopes.
- Data: read-only catalog plans passed for Food `17,596`, Restaurant `1,307`
  and Healthcare `281` records; `70` specialty rows were repaired only in
  derived output, and `scripts/dataops` plus cross-data tests passed (`9`).
- Disposable runtime: images, PostgreSQL and Gateway reached healthy state,
  but Web host port `5173` was occupied. The project was stopped without
  deleting its persistent volume, so full-stack runtime is **PARTIAL/UNVERIFIED**.

Interactive browser evidence is **UNVERIFIED** because the available browser
runtime reported no browser. No screenshot, responsive, interactive or
browser-console check is counted as a pass.
