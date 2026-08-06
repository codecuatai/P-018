# Local Development

The complete local backend stack uses one file only: root `/.env`. Do not create or copy `.env` files into applications/services for Docker Compose.

## Complete stack

Windows PowerShell:

```powershell
./scripts/setup-env.ps1
docker compose up --build
```

Linux/macOS:

```bash
./scripts/setup-env.sh
docker compose up --build
```

The setup scripts copy root `.env.example` only when root `.env` does not exist; they never overwrite it or touch service-level files. Review and replace local placeholders before startup. Existing `.env` files from an older layout must be reconciled manually with the current root `.env.example` because the setup script deliberately preserves them.

Validate without exposing values using `python scripts/validate-env-config.py` and `docker compose --env-file .env.example config`. Health endpoints are `/health/live` and `/health/ready` on the documented service ports.

## Standalone service development

Service-level `.env.example` files are optional references for a service running outside Compose. They contain only that service's variables. Since applications read process environment only, export/provide those values through your shell, IDE, or a service-specific Docker command; do not copy secrets among service files.

The existing web demo runs separately with `cd apps/web && npm run dev`. Migrations and seeds are still scaffolds; do not remove the PostgreSQL volume automatically.

## Package-manager decision

The root workspace and API gateway use pnpm with the committed root `pnpm-lock.yaml`; gateway CI and Docker use frozen lockfile installation. The existing Vite web app retains its valid npm lockfile and npm workflow, and the Expo mobile app is unchanged. Do not delete a valid lockfile merely to make tool names uniform.
