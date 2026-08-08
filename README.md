# X-One

X-One is a backend-first conversational multi-service booking platform. The local stack now contains Food ordering, Restaurant booking, Healthcare appointment, and Ride simulation slices, all reached through the NestJS Gateway and typed internal clients. The Agent emits typed requests and never executes domain side effects directly.

## What runs today

| Component | Port | Status |
| --- | ---: | --- |
| Web | 5173 | Ride chat UI backed only by the public Gateway |
| API Gateway | 3000 | Food, Restaurant, Healthcare, and Ride routing/orchestration with typed service clients |
| Agent Service | 8001 (internal Compose DNS only) | Food graph plus typed Restaurant, Healthcare, and Ride request graphs; Gemini is optional with deterministic fallback |
| Ride Service | 8101 (internal Compose DNS only) | Simulated quote/booking lifecycle with persistence and two explicit confirmations |
| Restaurant Service | 8102 (internal Compose DNS only) | PostgreSQL-backed restaurant search, availability, holds, and reservation boundary |
| Healthcare Service | 8103 (internal Compose DNS only) | PostgreSQL-backed departments, doctors, slots, payment acknowledgement, appointment holds/final confirmation, cancellation, and slot reuse |
| Food Service | 8104 (internal Compose DNS only) | PostgreSQL-backed catalog/cart/order boundary with deterministic demo seed |
| PostgreSQL | 5432 (internal Compose DNS only) | Local logical-database bootstrap |

For the complete local stack, create exactly one root `.env` and start Compose:

```powershell
./scripts/start-all.ps1
# or manually:
# ./scripts/setup-env.ps1
# docker compose up --build
```

```bash
./scripts/start-all.sh
# or manually:
# ./scripts/setup-env.sh
# docker compose up --build
```

The setup script never overwrites an existing `.env`. Compose reads root `.env` for interpolation and sends each container only its explicit, least-privilege values. Service-level `.env.example` files are only for standalone runs outside Compose. The web demo remains independent: `cd apps/web && npm run dev`.

See [the current architecture state](docs/architecture/current-state.md) for the evidence-backed implementation matrix, and [the documentation index](docs/README.md) for the supporting architecture, API, and runtime guidance. Read [AGENTS.md](AGENTS.md) before changing code.

The live verification command for the Food vertical slice is the documented `python -m pytest tests/e2e -q` against a running Compose Gateway with `E2E_GATEWAY_URL`; without that variable the external-stack checks skip and are not acceptance evidence. Unit/contract checks cover opaque-ID resolution and no-runtime-seed-literal regression. Live PostgreSQL/E2E/Docker/Gemini results are recorded only in `job.txt` after an actual run. Demo authentication and sandbox payment are development/test-only.
