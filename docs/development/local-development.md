# Local Development

The complete local stack uses one Compose interpolation file only: root
`/.env`. Do not copy root secrets into application/service files.

## Complete stack

Windows PowerShell:

```powershell
./scripts/start-all.ps1
# Optional: deterministic local demo data
./scripts/start-all.ps1 -SeedDemo
```

Linux/macOS:

```bash
./scripts/start-all.sh
# Optional: deterministic local demo data
./scripts/start-all.sh --seed-demo
```

The launcher copies root `.env.example` only when root `.env` does not exist;
it never overwrites it or touches service-level files. It validates the
environment, starts Compose, waits for health checks, runs owned migrations,
then verifies Gateway readiness and the Next.js Web health endpoint. Normal
runs do not seed or reset data. Review and replace local placeholders before
startup. Existing `.env` files from older layouts must be reconciled manually
because setup deliberately preserves them.

For an explicit disposable/template verification, PowerShell supports
`./scripts/start-all.ps1 -EnvFile .env.example`; normal local use remains root
`.env`. Validate without revealing values with:

```powershell
python scripts/validate-env-config.py
docker compose --env-file .env.example config --quiet
```

## Standalone service and Web development

Service-level `.env.example` files are optional references for a service
running outside Compose. They contain only that service's variables. Provide
them through the shell, IDE or an explicit service Docker command; do not copy
secrets between service files.

Run the App Router Web separately with:

```powershell
corepack pnpm --dir apps/web install --frozen-lockfile
corepack pnpm --dir apps/web dev
```

For that standalone Web run, use `apps/web/.env.local` with only
`NEXT_PUBLIC_API_URL` and optional decorative
`NEXT_PUBLIC_HERO_VIDEO_URL` / `NEXT_PUBLIC_HERO_POSTER_URL`. `NEXT_PUBLIC_*`
values are browser-visible, so none may contain a secret. The Web directly
calls the public Gateway, keeps its access token only in memory and never
fabricates domain cards in the browser.

When running services manually, apply owned migrations and deterministic seeds
explicitly:

```powershell
./scripts/migrate.ps1 .env.example
./scripts/seed.ps1 .env.example
```

The helpers preserve PostgreSQL volumes and do not perform destructive resets.

## Direct local-terminal workflow

The release-candidate workflow runs the seven application processes directly
and uses the existing PostgreSQL container only as database infrastructure:

```powershell
./scripts/local-dev.ps1 -EnvFile .env.example -WaitSeconds 90
./scripts/local-health.ps1
./scripts/seed-local.ps1 -EnvFile .env.example
./scripts/local-acceptance.ps1 -EnvFile .env.example
./scripts/local-stop.ps1
```

`local-dev.ps1` validates the environment, checks the PostgreSQL port, starts
Gateway, Agent, Food, Ride, Restaurant, Healthcare and Web in separate
PowerShell processes, records only those process IDs in ignored
`.local-runtime/processes.json`, and waits for `localhost:3000` and
`localhost:5173`. It never kills an unrelated process and `local-stop.ps1`
leaves PostgreSQL running. Add `-Migrate` only when an explicit migration run
is required. `seed-local.ps1` is additive and preserves imported catalogs,
bookings and dataset metadata; `demo-reset.ps1` is dry-run by default and
requires `-ConfirmReset` for an actor-scoped mutable-data reset.

`local-health.ps1` supports runtime auto-detection (`-Runtime Auto|Local|Compose`,
with `Host`/`Docker` accepted as aliases). In Compose mode, it checks published
Gateway/Web endpoints using dynamic port values from `.env`, verifies internal
domain services via container health status, and finishes with Gateway
`/health/ready` so a stack whose Gateway cannot reach its domain services still
fails. In Local mode, it probes all seven service HTTP health endpoints and
validates PID metadata in `.local-runtime/processes.json`. Auto-detection only
credits the direct-process runtime when a recorded PID is alive **and** its
recorded port is listening, so a stale `processes.json` cannot mask a running
Compose stack. When neither runtime is active, it outputs an explicit guidance
message instead of false failures. Pass `-EnvFile` to use a non-default
environment configuration. Shared port/value lookup, Compose container discovery
and live-process detection live in `scripts/_common.ps1`, which both
`local-health.ps1` and `local-acceptance.ps1` dot-source.

## Cross-service Compose acceptance

`local-acceptance.ps1` runs the cross-service suite in `tests/e2e` as a
mandatory step. That suite drives the real Gateway plus all domain services and
shells out to `docker compose exec`/`restart`, so it requires the Compose
runtime rather than the direct-process runtime:

```powershell
./scripts/start-all.ps1
./scripts/local-acceptance.ps1 -EnvFile .env.example
```

The step throws when fewer than the seven application containers are running,
instead of skipping. The suite is also runnable on its own:

```powershell
$env:E2E_GATEWAY_URL = "http://localhost:3000"
corepack pnpm test:e2e:crossservice   # or: python -m pytest tests/e2e -q
```

`E2E_GATEWAY_URL`, `E2E_COMPOSE_PROJECT_NAME`, `E2E_COMPOSE_ENV_FILE`,
`E2E_DEMO_EMAIL` and `E2E_DEMO_PASSWORD` are derived from the acceptance
`-EnvFile`, and `E2E_REQUIRE_GATEWAY=1` makes a missing Gateway URL a usage
error rather than a silent all-skip pass. `-SkipCrossServiceE2E` is available
but prints an explicit `UNVERIFIED` line so an incomplete run is never reported
as full acceptance. Note that the root `test:e2e:crossservice` script is the
Python Compose suite; the Playwright browser suite remains `pnpm --dir apps/web
test:e2e`.

For local browser acceptance, `.env.example` enables the labeled deterministic
geocode fallback and keeps `RIDE_TRACKING_TIME_SCALE=1`. A disposable
test/demo run may explicitly override the Ride scale (for example, `60`). Both are rejected or constrained in production;
the fallback is labeled `deterministic-local-demo` and is not booking
authority.

## Package manager

The root workspace, Gateway and Next.js Web use pnpm and the committed root
`pnpm-lock.yaml`; CI and Docker use frozen lockfile installation. The obsolete
Web npm lockfile and Vite configuration are intentionally absent after the App
Router migration. The Expo mobile app is unchanged.
