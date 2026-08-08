# Local Development

The complete local backend stack uses one file only: root `/.env`. Do not create or copy `.env` files into applications/services for Docker Compose.

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

The launcher copies root `.env.example` only when root `.env` does not exist; it never overwrites it or touches service-level files. It validates the environment, waits for Compose health, runs migrations, checks Gateway readiness, and starts Web only after those checks pass. Normal runs do not seed or reset data. Review and replace local placeholders before startup. Existing `.env` files from an older layout must be reconciled manually with the current root `.env.example` because setup deliberately preserves them.

For an explicit disposable/template verification, PowerShell supports `./scripts/start-all.ps1 -EnvFile .env.example`; the default and normal local path remain root `.env`.

Validate without exposing values using `python scripts/validate-env-config.py` and `docker compose --env-file .env.example config`. Health endpoints are `/health/live` and `/health/ready` on the documented service ports.

## Standalone service development

Service-level `.env.example` files are optional references for a service running outside Compose. They contain only that service's variables. Since applications read process environment only, export/provide those values through your shell, IDE, or a service-specific Docker command; do not copy secrets among service files.

The Web assistant can also run separately with `cd apps/web && npm run dev`; it
uses the unified Gateway conversation/action endpoints and does not fabricate
domain cards in the browser. When running services manually, apply service-owned migrations and deterministic seeds explicitly:

```powershell
./scripts/migrate.ps1 .env.example
./scripts/seed.ps1 .env.example
```

The helpers preserve the PostgreSQL volume and do not perform destructive resets. The Healthcare demo patient is seeded with a stable local identity, while all appointment writes remain actor-scoped at the domain boundary.

## Package-manager decision

The root workspace and API gateway use pnpm with the committed root `pnpm-lock.yaml`; gateway CI and Docker use frozen lockfile installation. The existing Vite web app retains its valid npm lockfile and npm workflow, and the Expo mobile app is unchanged. Do not delete a valid lockfile merely to make tool names uniform.
