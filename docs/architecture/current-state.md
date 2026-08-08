# Current Architecture State

This is the canonical, filesystem-backed source of truth for X-One's implementation status. It describes the repository as inspected on 2026-08-08; roadmap diagrams and legacy course material do not change a status below.

## Status vocabulary

- implemented: the repository contains the stated behavior/configuration and this document cites the supporting path and a check.
- skeleton: boundary, configuration, or layout exists, but the domain behavior is not wired or implemented.
- planned: no runnable or wired implementation exists.
- in-process: a module runs within an existing deployable boundary; it is not automatically a separately deployable service.
- standalone: a component has its own runtime/deployment boundary. This says nothing about feature completeness, availability, or production readiness.
- deprecated: retained but not for new development. legacy-reference: retained only for historical or course/reference use and not authoritative for X-One.

Status and deployment mode are independent. A current skeleton may be standalone, and a target box may remain in-process until a measured need supports a separate deployment boundary.

## Runtime shape and ownership

Clients may call only the gateway. The gateway owns public workflow orchestration, confirmation, audit/idempotency, and the payment sandbox boundary. The agent may only return a typed tool request to that gateway; it cannot call a domain service or database, create a booking, or charge payment. Restaurant owns dine-in table reservations; Food owns menus, food orders, and delivery/takeaway ordering.

Canonical product name: X-One. Legacy web demo name: NaviGo. The existing web demo includes flight, bus, train, and hotel scenarios inherited from the earlier NaviGo prototype. Those scenarios are demo-only and have no approved backend domain owner in the target architecture. The currently declared backend domains are Ride, Restaurant, Healthcare, and Food; travel and lodging ownership remain planned/TBD and must not be inferred from frontend mock data.

Each backend owner has one logical PostgreSQL database: gateway/Core xone_core, agent xone_agent, Ride xone_ride, Restaurant xone_restaurant, Healthcare xone_healthcare, and Food xone_food. The bootstrap script at infra/postgres/init/01-create-databases.sh creates the distinct roles/databases. Cross-database queries, foreign keys, and shared ORM models are prohibited; cross-service data travels through REST/JSON/OpenAPI contracts.

Logical ownership is mandatory: each domain owns its schema/tables, migrations, and state, while other domains use contracts rather than SQL or shared ORM entities. The local foundation currently uses one PostgreSQL instance with separate logical databases/roles. Physical instance or cluster separation is deferred until measured scale, reliability, security, compliance, team-ownership, deployment-independence, or operational-isolation needs justify it.

## Observed implementation matrix

| Component | Status | Evidence | Current limitation |
| --- | --- | --- | --- |
| Web | implemented (Ride FE source) | apps/web/src/App.tsx, apps/web/src/mocks/mockService.ts, apps/web/src/api.ts | Ride's mock-driven presentation remains the source of truth; any browser backend calls use the public Gateway and do not own booking state. |
| Mobile | skeleton | apps/mobile/App.tsx | Expo shell only; no API integration. |
| API Gateway | implemented (four-domain orchestration) | apps/api-gateway/src/modules/{auth,tools,confirmation,payment,workflow,conversation}, apps/api-gateway/src/clients/{clients.module.ts,service.clients.ts}, apps/api-gateway/src/resilience/, migrations 001-006 | PostgreSQL is the runtime repository in Compose; in-memory Core repository is test-only. Food, Restaurant, Healthcare, and Ride use separate typed workflow/client boundaries; final or financial operations remain confirmation-gated. |
| Agent service | implemented (four typed request graphs) | apps/agent-service/src/agents/{graph.py,restaurant_graph.py,healthcare_graph.py,ride_graph.py}, apps/agent-service/src/services/{gateway.py,llm.py}, apps/agent-service/src/api/routes.py | Food remains the canonical graph with validated structured output and deterministic fallback. Restaurant and Healthcare read-result persistence, natural-language selection, and final-confirmation proposals are tested; Gemini quota/rate-limit fallback is configured. The Agent still emits typed requests only and never executes a final side effect. |
| Ride service | implemented (simulation slice) | services/ride-service/src/{main.py,api/rides.py,application/ride_service.py,domain/ride.py,infrastructure/,repositories/}, migrations/versions/20260806_0001_ride_simulation.py, tests/ | Deterministic PostgreSQL-backed quote/booking lifecycle is local/demo-only; Gateway owns public orchestration and two explicit confirmations. |
| Restaurant service | implemented (partial vertical slice) | services/restaurant-service/src/main.py, src/api/v1/, src/infrastructure/, migrations/versions/0001_restaurant_booking.py, seeds/seed.py, tests/test_restaurant_service.py | PostgreSQL-backed discovery, availability, holds, reservation creation/replay, auth, and structured response envelope are wired and locally tested; update/cancel lifecycle, confirmation evidence contract, PostgreSQL integration/concurrency execution, and generated client remain incomplete. |
| Healthcare service | implemented (local booking slice) | services/healthcare-service/src/{main.py,api/routes.py,database.py,models/medical.py}, migrations/{001_healthcare_booking.sql,002_healthcare_slot_reuse.sql}, seeds/seed_medical.py, tests/{test_medical_schema.py,test_postgres_slot_reuse.py} | PostgreSQL-backed departments, authoritative doctor/slot/price data, actor-scoped holds/payment acknowledgement/cancel, idempotency, explicit final confirmation, and active-slot reuse are wired. Payment is a local acknowledgement adapter; production provider integration is out of scope. |
| Food service | implemented (vertical slice) | services/food-service/src/application/food_service.py, src/domain/quotes.py, src/api/food.py, src/repositories/food.py, migrations 001-005, seeds/001_demo_hanoi.sql, tests/ | PostgreSQL adapter recomputes the canonical quote under cart/catalog/address/voucher locks, exposes actor-scoped address discovery, enforces actor-owned resources, cart/order idempotency, voucher eligibility, transition operation idempotency, due workflow claims, driver locks, and immutable event tables. |
| Tool/OpenAPI contracts and generated TS clients | implemented (four-domain contracts) | packages/contracts/tools/{tool-request.schema.json,ride-tool-request.schema.json}, packages/contracts/openapi/{food-vertical-slice.yaml,gateway-food-vertical-slice.yaml,restaurant-service-v1.yaml,gateway-v1.yaml,agent-service.v1.yaml,ride-service.v1.yaml,gateway-public.v1.yaml} | Domain and workflow contracts are versioned; generated clients remain ungenerated because the typed Gateway adapters are hand-owned transport code. |
| Local Compose and database bootstrap | implemented | docker-compose.yml, .env.example, infra/postgres/init/01-create-databases.sh, scripts/validate-env-config.py | All six application containers plus PostgreSQL built and reached healthy status using `.env.example`; bootstrap still runs only for a new postgres_data volume. |
| Migrations and seeds | implemented (four domain slices) | Core migration 001-006, Food migration 001-005, Restaurant Alembic revision, Healthcare SQL migrations 001-002, Ride Alembic revision, deterministic Food/Restaurant/Healthcare seeds, scripts/migrate.{ps1,sh}, scripts/seed.{ps1,sh} | Each owner keeps its migration boundary; root helpers applied all current migrations and deterministic seeds without deleting the existing volume. PowerShell Food seeding preserves UTF-8 catalog data. |
| Automated tests and CI | implemented (local integrated scope) | services/{food-service,restaurant-service,healthcare-service,ride-service}/tests/, apps/{api-gateway,agent-service}/test*/, apps/web/package.json, .github/workflows/ci.yml | Local service tests, Gateway lint/build/Jest, Agent pytest/Ruff, application Python Ruff, and Web production build pass; external-provider and disposable PostgreSQL suites remain environment-dependent. |
| Deployment | planned | no deployment manifest outside local Compose | No production deployment or cloud pipeline is present. |

## Intended ownership and deployment reading

The current contract inventory also includes `packages/contracts/openapi/healthcare-service-v1.yaml`; the domain and workflow contracts above are the checked-in source of truth for the local integrated slice.

This table describes intended authority, not a promise that an interface exists. The implementation matrix above remains the status source of truth.

| Component | Current status | Intended authority/data owner | Current deployment mode |
| --- | --- | --- | --- |
| Web | implemented (mock) | No authoritative domain data | standalone web demo |
| Mobile | skeleton | No authoritative domain data | standalone mobile shell |
| Gateway | implemented (four-domain orchestration) | Public workflow/audit/idempotency metadata in Core; never domain state | standalone gateway runtime |
| Agent | implemented (four typed request graphs) | Approved agent run/checkpoint metadata only | standalone agent runtime |
| Ride, Restaurant, Healthcare | implemented (partial local slices) | Their respective domain data and state transitions | standalone domain-service runtimes |
| Food | implemented (ordering slice) | Menus, carts, vouchers, delivery, orders, drivers, and status events | standalone domain-service runtime |

The checked repository has separate runtime entrypoints for the listed components, but that does not make their planned business interfaces implemented or available.

## Repository roles

- apps/ contains deployable applications: the gateway and agent today, plus web/mobile shells. Future browser/mobile traffic still terminates at the gateway.
- services/ contains independently deployable domain owners. Each owns its persistence and API; api/ is the HTTP edge, application/ coordinates use cases, domain/ holds pure rules, and repositories/ is the persistence boundary. Current models/ directories contain API/schema placeholders, not database models.
- packages/contracts/ holds inter-service contracts: openapi/ for REST descriptions and tools/ for agent capability schemas. A tool schema is not a REST endpoint.
- packages/generated-ts-clients/ is generated from OpenAPI only; do not add business logic or hand-edit generated output.
- packages/shared-config/ is limited to small reference configuration such as currency, timezone, service type, and common error code - never ORM, database access, business logic, or secrets.
- infra/postgres/init/ is local PostgreSQL bootstrap only. It is not a service migration runner. Service-owned migrations/ and seeds/ run migration first, then deterministic seed data when those implementations exist.
- Root tests/ is reserved for cross-service unit/integration/contract/e2e/evaluation suites; the live Food vertical-slice suite is tests/e2e/test_food_vertical_slice.py.

## Local development facts

Root .env.example is the Compose source of truth. Compose uses explicit mappings, not env_file: PostgreSQL receives bootstrap credentials; gateway receives Core DB/internal URLs/token; agent receives its DB, CORS, Gemini configuration, and token; each domain receives only its own database URL, port, and token. Internal URLs use Docker service names (agent-service, ride-service, restaurant-service, healthcare-service, food-service), not localhost.

| Service | Compose name | Host/container port in the checked example | Health endpoints |
| --- | --- | --- | --- |
| Gateway | api-gateway | 3000:3000 | /health/live, /health/ready |
| Agent | agent-service | 8001 internal only (expose) | /health/live, /health/ready |
| Ride | ride-service | 8101 internal only (expose) | /health/live, /health/ready |
| Restaurant | restaurant-service | 8102 internal only (expose) | /health/live, /health/ready |
| Healthcare | healthcare-service | 8103 internal only (expose) | /health/live, /health/ready |
| Food | food-service | 8104 internal only (expose) | /health/live, /health/ready |
| PostgreSQL | postgres | 5432 internal only | container pg_isready |

The repository provides these local commands:

    ./scripts/setup-env.ps1
    docker compose up --build
    python scripts/validate-env-config.py
    docker compose --env-file .env.example config --quiet
    ./scripts/migrate.ps1 .env.example
    ./scripts/seed.ps1 .env.example

The equivalent shell helpers are scripts/setup-env.sh, scripts/migrate.sh, and scripts/seed.sh; migration/seed helpers accept an optional env-file path as their first argument. Food and Gateway /health/ready report the database/worker dependencies they actually check; they are not a substitute for the full cross-service smoke flow.

## Verification observed in this audit

On 2026-08-08 the integrated local scope passed environment validation, Compose configuration, whitespace/conflict-marker checks, and the applicable service checks: Agent pytest 68 passed with Ruff; Food pytest 21 passed/3 skipped; Restaurant pytest 9 passed; Healthcare pytest 7 passed/1 skipped; Ride pytest 10 passed; Gateway Jest 30 passed/3 skipped with lint/build; Web production build; and Ruff across the application Python services. Repository logging scripts retain unrelated pre-existing Ruff findings; the migration-parity and environment-validation helpers pass targeted Ruff checks.

Docker Compose built all six application images and PostgreSQL with `.env.example`; all application health checks and PostgreSQL reached healthy status. The migration and seed helpers applied Core, Food, Restaurant, Healthcare, and Ride migrations plus deterministic seeds without deleting the existing volume. Gateway smoke checks covered authentication, Food Agent -> Gateway Tool Registry -> Food (four seeded items), Ride quote/service/payment completion (`DRIVER_ASSIGNED`), Restaurant search/availability/hold/explicit final reservation confirmation, and Healthcare department/slot/hold/payment/explicit final confirmation/cancellation plus slot reuse. Food E2E completed 15/15.

Gemini is optional for this acceptance run. `AGENT_MODEL_MODE=deterministic` avoids provider calls while preserving the typed request boundary; `AGENT_MODEL_MODE=gemini` remains available for provider-dependent testing with `gemini-3.1-flash-lite` as the configured quota/rate-limit fallback. No provider quota was consumed by the final local smoke run; disposable PostgreSQL suites remain environment-dependent, while the live Healthcare database index/reuse transaction check passed.

## Change rules derived from the current state

Business API changes must add a versioned OpenAPI contract, any needed generated client, API/contract tests, and matching documentation. A schema change needs an owned migration before an optional deterministic seed, plus data-architecture and test updates. Food order placement and cancellation remain separate confirmation actions; final execution revalidates authoritative Food state.

## Incremental delivery guidance

Implement one walking vertical slice at a time: user request -> gateway -> agent intent/tool selection -> provider lookup -> draft/quote -> user confirmation -> domain booking creation -> structured result. This is a target sequence, not a running flow. Add confirmation, idempotency, and audit before its important side effects; a target box does not need to become a separate physical service/database before the first end-to-end slice is complete.
