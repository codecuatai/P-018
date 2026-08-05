# X-One

X-One is a backend-first conversational multi-service booking platform. This repository currently provides an architecture foundation: a NestJS orchestration gateway, a FastAPI/LangGraph agent service, and FastAPI skeletons for ride, restaurant, and healthcare. The existing React web demo and Expo mobile shell remain mock-driven.

## What runs today

| Component | Port | Status |
| --- | ---: | --- |
| API Gateway | 3000 | Skeleton: health, validation, safe errors, correlation IDs |
| Agent Service | 8001 | Existing LangGraph demo moved and retained |
| Ride / Restaurant / Healthcare / Food | 8101 / 8102 / 8103 / 8104 | Skeleton: health endpoints only |
| PostgreSQL | 5432 | Local logical-database bootstrap |

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
