# X-One

X-One is a backend-first conversational multi-service booking platform. The local stack now contains Food ordering, Restaurant booking, Healthcare appointment, and Ride simulation slices, all reached through the NestJS Gateway and typed internal clients. The Agent emits typed requests and never executes domain side effects directly.

## What runs today

| Component | Port | Status |
| --- | ---: | --- |
| Web | 5173 | Next.js App Router landing, authenticated product shell, and one unified Gateway-only Ride, Food, Restaurant, Healthcare conversation |
| API Gateway | 3000 | Food, Restaurant, Healthcare, and Ride routing/orchestration with typed service clients |
| Agent Service | 8001 (internal Compose DNS only) | One bounded structured planner for Ride, Food, Restaurant, and Healthcare; Gemini is primary with deterministic fallback |
| Ride Service | 8101 (internal Compose DNS only) | Simulated quote/booking lifecycle with persistence and two explicit confirmations |
| Restaurant Service | 8102 (internal Compose DNS only) | PostgreSQL-backed restaurant search, availability, holds, and reservation boundary |
| Healthcare Service | 8103 (internal Compose DNS only) | PostgreSQL-backed departments, doctors, slots, payment acknowledgement, appointment holds/final confirmation, cancellation, and slot reuse |
| Food Service | 8104 (internal Compose DNS only) | PostgreSQL-backed catalog/cart/order boundary with deterministic demo seed |
| PostgreSQL | 5432 (internal Compose DNS only) | Local logical-database bootstrap |

For the complete local stack, create exactly one root `.env` and use the checked launcher. It validates configuration, builds Compose, waits for PostgreSQL and all application health checks, applies idempotent migrations, verifies Gateway readiness, and then verifies the Next.js Web container:

```powershell
./scripts/start-all.ps1
# add deterministic demo data explicitly when needed:
# ./scripts/start-all.ps1 -SeedDemo
```

```bash
./scripts/start-all.sh
# add deterministic demo data explicitly when needed:
# ./scripts/start-all.sh --seed-demo
```

The setup script never overwrites an existing `.env`. Normal launcher runs do not seed or reset data; use `-SeedDemo`/`--seed-demo` only for deterministic local demo data. Compose reads root `.env` for interpolation and sends each container only its explicit, least-privilege values. Service-level `.env.example` files are only for standalone runs outside Compose. The Web uses a short-lived access token only in memory, receives its rotating refresh token only as an HttpOnly cookie, calls only the public Gateway, and never exposes internal service URLs or credentials.

For a disposable/template-based local verification, PowerShell also accepts `-EnvFile .env.example`; the default remains `.env`, and an existing user file is never overwritten.

See [the current architecture state](docs/architecture/current-state.md) for the evidence-backed implementation matrix, and [the documentation index](docs/README.md) for the supporting architecture, API, and runtime guidance. Read [AGENTS.md](AGENTS.md) before changing code.

The live verification command is `E2E_GATEWAY_URL=http://localhost:3000 python -m pytest tests/e2e -q` against a running Compose Gateway; without that variable the external-stack checks may skip and `SKIPPED` live E2E is not acceptance evidence. The suite includes the unified assistant scenarios in `tests/e2e/test_unified_assistant.py` plus the existing Food, Ride, Restaurant, and Healthcare workflow checks. Unit/contract checks cover opaque-ID resolution and no-runtime-seed-literal regression. Live PostgreSQL/E2E/Docker/Gemini results are recorded only in `job.txt` after an actual run. Demo authentication and sandbox payment are development/test-only.

The unified assistant keeps independent task revisions and action cohorts in one
conversation. An unrelated follow-up leaves existing pending actions intact;
changed details invalidate the prior revision with `409 ACTION_NOT_AVAILABLE`.
Food and Healthcare cards are derived from authoritative service responses, and
the Web retains only current-tab conversation/action data in `sessionStorage`.
