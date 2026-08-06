# Current Architecture State

This is the canonical, filesystem-backed source of truth for X-One's implementation status. It describes the repository as inspected on 2026-08-05; roadmap diagrams and legacy course material do not change a status below.

## Status vocabulary

- `implemented`: the repository contains the stated behavior/configuration and this document cites the supporting path and a check.
- `skeleton`: boundary, configuration, or layout exists, but the domain behavior is not wired or implemented.
- `planned`: no runnable or wired implementation exists.
- `in-process`: a module runs within an existing deployable boundary; it is not automatically a separately deployable service.
- `standalone`: a component has its own runtime/deployment boundary. This says nothing about feature completeness, availability, or production readiness.
- `deprecated`: retained but not for new development. `legacy-reference`: retained only for historical or course/reference use and not authoritative for X-One.

Status and deployment mode are independent. A current skeleton may be standalone, and a target box may remain in-process until a measured need supports a separate deployment boundary.

## Runtime shape and ownership

```mermaid
flowchart LR
  Client[Web / mobile client] --> Gateway[API Gateway]
  Gateway --> Agent[Agent service]
  Gateway --> Ride[Ride service]
  Gateway --> Restaurant[Restaurant service]
  Gateway --> Healthcare[Healthcare service]
  Gateway --> Food[Food service]
```

Clients may call only the gateway. The gateway owns public workflow orchestration, confirmation, audit/idempotency, and the payment sandbox boundary. The agent may only return a typed tool request to that gateway; it cannot call a domain service or database, create a booking, or charge payment. Restaurant owns dine-in table reservations; Food owns menus, food orders, and delivery/takeaway ordering.

Canonical product name: **X-One**. Legacy web demo name: **NaviGo**. The existing web demo includes flight, bus, train, and hotel scenarios inherited from the earlier NaviGo prototype. Those scenarios are demo-only and have no approved backend domain owner in the target architecture. The currently declared backend domains are Ride, Restaurant, Healthcare, and Food; travel and lodging ownership remain planned/TBD and must not be inferred from frontend mock data.

Each backend owner has one logical PostgreSQL database: gateway/Core `xone_core`, agent `xone_agent`, Ride `xone_ride`, Restaurant `xone_restaurant`, Healthcare `xone_healthcare`, and Food `xone_food`. The bootstrap script at `infra/postgres/init/01-create-databases.sh` creates the distinct roles/databases. Cross-database queries, foreign keys, and shared ORM models are prohibited; cross-service data travels through REST/JSON/OpenAPI contracts.

Logical ownership is mandatory: each domain owns its schema/tables, migrations, and state, while other domains use contracts rather than SQL or shared ORM entities. The local foundation currently uses one PostgreSQL instance with separate logical databases/roles. Physical instance or cluster separation is deferred until measured scale, reliability, security, compliance, team-ownership, deployment-independence, or operational-isolation needs justify it.

## Observed implementation matrix

| Component | Status | Evidence | Current limitation |
| --- | --- | --- | --- |
| Web | implemented | `apps/web/src/App.tsx`, `apps/web/src/mocks/mockService.ts` | UI is a localStorage/mock demo; it does not implement the gateway workflow. `src/api.ts` only defines a future gateway-facing helper. |
| Mobile | skeleton | `apps/mobile/App.tsx` | Expo shell only; no API integration. |
| API Gateway | implemented (Food vertical slice) | `apps/api-gateway/src/modules/{auth,tools,confirmation,payment,workflow}`, `src/clients/service.clients.ts`, `migrations/001_core_vertical_slice.sql`, `002_core_persistence_slice.sql`, `003_core_atomicity.sql` | PostgreSQL is the runtime repository in Compose; in-memory Core repository is test-only. The reconciliation worker is enabled by Compose configuration; full Docker/E2E smoke remains environment-dependent. |
| Agent service | implemented (Food tool-request slice) | `apps/agent-service/src/agents/graph.py`, `src/services/gateway.py`, `src/services/llm.py`, `src/api/routes.py` | Structured Vietnamese intent/slot graph calls only Gateway internal tools; Gemini adapter is lazy and needs a configured key for live model smoke. |
| Ride service | skeleton | `services/ride-service/src/main.py`, `src/api/health.py`, `tests/` | Health/config/layer directories only; no ride API, persistence adapter, Alembic revision, or seed data. |
| Restaurant service | skeleton | `services/restaurant-service/src/main.py`, `src/api/health.py`, `tests/` | Health/config/layer directories only; no table-reservation API, persistence adapter, Alembic revision, or seed data. |
| Healthcare service | skeleton | `services/healthcare-service/src/main.py`, `src/api/health.py`, `tests/` | Health/config/layer directories only; no appointment API, persistence adapter, Alembic revision, or seed data. |
| Food service | implemented (vertical slice) | `services/food-service/src/application/food_service.py`, `src/api/food.py`, `src/repositories/food.py`, `migrations/001_food_vertical_slice.sql`, `002_food_workflow_concurrency.sql`, `003_food_atomicity.sql`, `seeds/001_demo_hanoi.sql`, `tests/` | PostgreSQL adapter uses owned JSONB catalog/order snapshots, atomic order/voucher creation, due workflow claims, driver locks, and immutable event tables; live Docker/E2E evidence remains environment-dependent. |
| Tool/OpenAPI contracts and generated TS clients | implemented (Food slice) | `packages/contracts/tools/tool-request.schema.json`, `packages/contracts/openapi/food-vertical-slice.yaml`, `packages/contracts/openapi/gateway-food-vertical-slice.yaml`, `packages/generated-ts-clients/README.md` | Food-owned and public Gateway contracts are versioned; generated clients remain ungenerated because the typed Gateway adapter is hand-owned transport code. |
| Local Compose and database bootstrap | implemented | `docker-compose.yml`, `.env.example`, `infra/postgres/init/01-create-databases.sh`, `scripts/validate-env-config.py` | Static configuration is verifiable; an audit must report separately whether Docker build/up was actually run. Bootstrap runs only for a new `postgres_data` volume. |
| Migrations and seeds | implemented (Food/Core slice) | Core/Food migration 001+002 files, `services/food-service/seeds/001_demo_hanoi.sql`, `scripts/migrate.ps1`, `scripts/seed.ps1` | Scripts require a running PostgreSQL Compose service; other domain migrations/seeds remain planned. |
| Automated tests and CI | implemented (local Food/Core/Agent slice) | `services/food-service/tests/`, `apps/api-gateway/test/`, `apps/agent-service/tests/`, `.github/workflows/ci.yml` | Local unit/adapter tests cover atomic claims, payment/refund idempotency, voucher/order atomicity, worker claiming, structured Agent flow, and tool safeguards. PostgreSQL suites run only with explicit disposable database URLs; cross-service E2E still needs a running stack. |
| Deployment | planned | no deployment manifest outside local Compose | No production deployment or cloud pipeline is present. |

## Intended ownership and deployment reading

This table describes intended authority, not a promise that an interface exists. The implementation matrix above remains the status source of truth.

| Component | Current status | Intended authority/data owner | Current deployment mode |
| --- | --- | --- | --- |
| Web | implemented (mock) | No authoritative domain data | standalone web demo |
| Mobile | skeleton | No authoritative domain data | standalone mobile shell |
| Gateway | implemented (Food slice) | Public workflow/audit/idempotency metadata in Core; never domain state | standalone gateway runtime |
| Agent | implemented (Food tool-request slice) | Approved agent run/checkpoint metadata only | standalone agent runtime |
| Ride, Restaurant, Healthcare | skeleton | Their respective future domain data and state transitions | standalone domain-service runtimes |
| Food | implemented (ordering slice) | Menus, carts, vouchers, delivery, orders, drivers, and status events | standalone domain-service runtime |

The checked repository has separate runtime entrypoints for the listed components, but that does not make their planned business interfaces implemented or available.

## Repository roles

- `apps/` contains deployable applications: the gateway and agent today, plus web/mobile shells. Future browser/mobile traffic still terminates at the gateway.
- `services/` contains independently deployable domain owners. Each owns its persistence and API; `api/` is the HTTP edge, `application/` coordinates use cases, `domain/` holds pure rules, and `repositories/` is the persistence boundary. Current `models/` directories contain API/schema placeholders, not database models.
- `packages/contracts/` holds inter-service contracts: `openapi/` for REST descriptions and `tools/` for agent capability schemas. A tool schema is not a REST endpoint.
- `packages/generated-ts-clients/` is generated from OpenAPI only; do not add business logic or hand-edit generated output.
- `packages/shared-config/` is limited to small reference configuration such as currency, timezone, service type, and common error code—never ORM, database access, business logic, or secrets.
- `infra/postgres/init/` is local PostgreSQL bootstrap only. It is not a service migration runner. Service-owned `migrations/` and `seeds/` run migration first, then deterministic seed data when those implementations exist.
- Root `tests/` is reserved for cross-service unit/integration/contract/e2e/evaluation suites; the directories currently contain README placeholders.

## Local development facts

Root `.env.example` is the Compose source of truth. Compose uses explicit mappings, not `env_file`: PostgreSQL receives bootstrap credentials; gateway receives Core DB/internal URLs/token; agent receives its DB, CORS, Gemini configuration, and token; each domain receives only its own database URL, port, and token. Internal URLs use Docker service names (`agent-service`, `ride-service`, `restaurant-service`, `healthcare-service`, `food-service`), not `localhost`.

| Service | Compose name | Host/container port in the checked example | Health endpoints |
| --- | --- | --- | --- |
| Gateway | `api-gateway` | `3000:3000` | `/health/live`, `/health/ready` |
| Agent | `agent-service` | `8001:8001` | `/health/live`, `/health/ready` |
| Ride | `ride-service` | `8101:8101` | `/health/live`, `/health/ready` |
| Restaurant | `restaurant-service` | `8102:8102` | `/health/live`, `/health/ready` |
| Healthcare | `healthcare-service` | `8103:8103` | `/health/live`, `/health/ready` |
| Food | `food-service` | `8104:8104` | `/health/live`, `/health/ready` |
| PostgreSQL | `postgres` | `5432:5432` | container `pg_isready` |

The repository provides these local commands:

```powershell
./scripts/setup-env.ps1
docker compose up --build
python scripts/validate-env-config.py
docker compose --env-file .env.example config --quiet
./scripts/migrate.ps1  # applies additive Core and Food migrations
./scripts/seed.ps1     # applies deterministic Food demo seed
```

The equivalent shell helpers are `scripts/setup-env.sh`, `scripts/migrate.sh`, and `scripts/seed.sh`. Food and Gateway `/health/ready` report the database/worker dependencies they actually check; they are not a substitute for the full cross-service smoke flow.

## Verification observed in this audit

The following checks passed during this hardening session: Gateway lint/build/tests (13 tests including 2 PostgreSQL integration tests), Food Ruff/pytest (14 passed including 2 PostgreSQL integration tests), and Agent Ruff/pytest (8 tests). `docker compose --env-file .env.example config --quiet`, all-service Docker build/start, owned migrations/seed, health smoke, restart smoke, and live Food/Agent smoke also passed.

The formal ten-scenario cross-service E2E matrix is not implemented, so it is not claimed here; the live smoke covered Gateway-through-Food order/payment/refund, timed delivery, and UTF-8 Agent state propagation. Remote GitHub Actions execution and live Gemini behavior were not run. Demo authentication and sandbox payment remain non-production.

## Change rules derived from the current state

Business API changes must add a versioned OpenAPI contract, any needed generated client, API/contract tests, and matching documentation. A schema change needs an owned migration before an optional deterministic seed, plus data-architecture and test updates. Food order placement and cancellation remain separate confirmation actions; final execution revalidates authoritative Food state.

## Incremental delivery guidance

Implement one walking vertical slice at a time: user request → gateway → agent intent/tool selection → provider lookup → draft/quote → user confirmation → domain booking creation → structured result. This is a target sequence, not a running flow. Add confirmation, idempotency, and audit before its important side effects; a target box does not need to become a separate physical service/database before the first end-to-end slice is complete.
