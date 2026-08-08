# X-One

X-One is a backend-first conversational multi-service booking platform. The local stack now contains Food ordering, Restaurant booking, Healthcare appointment, and Ride simulation slices, all reached through the NestJS Gateway and typed internal clients. The Agent emits typed requests and never executes domain side effects directly.

## What runs today

| Component | Port | Status |
| --- | ---: | --- |
| Web | 5173 | Ride chat UI remains MockService-first; optional backend helper uses the public Gateway |
| API Gateway | 3000 | Food, Restaurant, Healthcare, and Ride routing/orchestration with typed service clients |
| Agent Service | 8001 (internal Compose DNS only) | Food graph plus typed Restaurant, Healthcare, and Ride request graphs; Gemini is optional with deterministic fallback |
| Ride Service | 8101 (internal Compose DNS only) | Simulated quote/booking lifecycle with persistence and two explicit confirmations |
| Restaurant Service | 8102 (internal Compose DNS only) | PostgreSQL-backed restaurant search, availability, holds, and reservation boundary |
| Healthcare Service | 8103 (internal Compose DNS only) | PostgreSQL-backed departments, doctors, slots, payment acknowledgement, appointment holds/final confirmation, cancellation, and slot reuse |
| Food Service | 8104 (internal Compose DNS only) | PostgreSQL-backed catalog/cart/order boundary with deterministic demo seed |
| PostgreSQL | 5432 (internal Compose DNS only) | Local logical-database bootstrap |

For the complete local stack, create exactly one root `.env` and use the checked launcher. It validates configuration, builds Compose, waits for PostgreSQL and all application health checks, applies idempotent migrations, verifies Gateway readiness, and only then starts the Web dev server:

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

The setup script never overwrites an existing `.env`. Normal launcher runs do not seed or reset data; use `-SeedDemo`/`--seed-demo` only for deterministic local demo data. Compose reads root `.env` for interpolation and sends each container only its explicit, least-privilege values. Service-level `.env.example` files are only for standalone runs outside Compose. The Web ChatDashboard remains a legacy Ride presentation driven by `MockService`; its optional `sendChatMessage` helper calls only the public Gateway with actor/workflow headers.

For a disposable/template-based local verification, PowerShell also accepts `-EnvFile .env.example`; the default remains `.env`, and an existing user file is never overwritten.

See [the current architecture state](docs/architecture/current-state.md) for the evidence-backed implementation matrix, and [the documentation index](docs/README.md) for the supporting architecture, API, and runtime guidance. Read [AGENTS.md](AGENTS.md) before changing code.

The live verification command is `E2E_GATEWAY_URL=http://localhost:3000 python -m pytest tests/e2e -q` against a running Compose Gateway; without that variable the external-stack checks may skip and `SKIPPED` live E2E is not acceptance evidence. The suite is split between `tests/e2e/test_food_vertical_slice.py` and `tests/e2e/test_four_domain_workflows.py`, covering Food plus the Ride, Restaurant, and Healthcare public workflows. Unit/contract checks cover opaque-ID resolution and no-runtime-seed-literal regression. Live PostgreSQL/E2E/Docker/Gemini results are recorded only in `job.txt` after an actual run. Demo authentication and sandbox payment are development/test-only.
