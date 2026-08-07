# X-One

X-One is a backend-first conversational multi-service booking platform. This repository now contains a Food ordering vertical slice: FastAPI Food Service, owned PostgreSQL migration/seed, Gateway demo auth/tools/confirmation/payment sandbox/workflow, and a Gateway-only LangGraph agent adapter. Ride, Restaurant, and Healthcare remain health/config skeletons; the React web demo and Expo mobile shell remain mock-driven.

## What runs today

| Component | Port | Status |
| --- | ---: | --- |
| API Gateway | 3000 | Food workflow slice: auth, tools, confirmation, sandbox payment, typed clients |
| Agent Service | 8001 (internal Compose DNS only) | Structured LangGraph food intent/tool-request flow; Gemini is lazy/optional |
| Ride / Restaurant / Healthcare | 8101 / 8102 / 8103 (internal Compose DNS only) | Skeleton: health/config only |
| Food Service | 8104 (internal Compose DNS only) | PostgreSQL-backed catalog/cart/order boundary with deterministic demo seed |
| PostgreSQL | 5432 (internal Compose DNS only) | Local logical-database bootstrap |

For the complete local stack, create exactly one root `.env` and start Compose:

```powershell
./scripts/setup-env.ps1
docker compose up --build
```

```bash
./scripts/setup-env.sh
docker compose up --build
```

The setup script never overwrites an existing `.env`. Compose reads root `.env` for interpolation and sends each container only its explicit, least-privilege values. Service-level `.env.example` files are only for standalone runs outside Compose. The web demo remains independent: `cd apps/web && npm run dev`.

See [the current architecture state](docs/architecture/current-state.md) for the evidence-backed implementation matrix, and [the documentation index](docs/README.md) for the supporting architecture, API, and runtime guidance. Read [AGENTS.md](AGENTS.md) before changing code.

The live verification command for the Food vertical slice is the documented `python -m pytest tests/e2e -q` against a running Compose Gateway with `E2E_GATEWAY_URL`; without that variable the external-stack checks skip and are not acceptance evidence. Unit/contract checks cover opaque-ID resolution and no-runtime-seed-literal regression. Live PostgreSQL/E2E/Docker/Gemini results are recorded only in `job.txt` after an actual run. Demo authentication and sandbox payment are development/test-only.
