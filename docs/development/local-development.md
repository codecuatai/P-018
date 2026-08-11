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

## Package manager

The root workspace, Gateway and Next.js Web use pnpm and the committed root
`pnpm-lock.yaml`; CI and Docker use frozen lockfile installation. The obsolete
Web npm lockfile and Vite configuration are intentionally absent after the App
Router migration. The Expo mobile app is unchanged.
