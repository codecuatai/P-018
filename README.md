# X-One

X-One is a backend-first conversational multi-service booking platform. The first local Ride walking slice now runs from React chat through the NestJS Gateway and deterministic Agent to the simulated Ride domain. Restaurant, Healthcare, Food, mobile, production authentication, and real payment remain skeleton/planned.

## What runs today

| Component | Port | Status |
| --- | ---: | --- |
| Web | 5173 | Ride chat UI backed only by the public Gateway |
| API Gateway | 3000 | Ride workflow orchestration, typed Agent/Ride clients, two explicit confirmations |
| Agent Service | 8001 | Skeleton: deterministic Ride state patches and typed tool requests; no execution |
| Ride Service | 8101 | Implemented simulation slice: quotes, two-step booking confirmation, driver assignment, cancellation, persistence |
| Restaurant / Healthcare / Food | 8102 / 8103 / 8104 | Skeleton: health endpoints only |
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
