# Current Architecture State

This is the canonical, filesystem-backed source of truth for X-One's implementation status. It describes the repository as inspected on 2026-08-09; roadmap diagrams and legacy course material do not change a status below.

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

Canonical product name: X-One. Older NaviGo flight, bus, train, and hotel material is historical reference only; it is not part of the current product surface or an approved domain. The currently declared backend domains are Ride, Restaurant, Healthcare, and Food; travel and lodging ownership remain planned/TBD and must not be inferred from frontend mock data.

Each backend owner has one logical PostgreSQL database: gateway/Core xone_core, agent xone_agent, Ride xone_ride, Restaurant xone_restaurant, Healthcare xone_healthcare, and Food xone_food. The bootstrap script at infra/postgres/init/01-create-databases.sh creates the distinct roles/databases. Cross-database queries, foreign keys, and shared ORM models are prohibited; cross-service data travels through REST/JSON/OpenAPI contracts.

Logical ownership is mandatory: each domain owns its schema/tables, migrations, and state, while other domains use contracts rather than SQL or shared ORM entities. The local foundation currently uses one PostgreSQL instance with separate logical databases/roles. Physical instance or cluster separation is deferred until measured scale, reliability, security, compliance, team-ownership, deployment-independence, or operational-isolation needs justify it.

## Observed implementation matrix

| Component | Status | Evidence | Current limitation |
| --- | --- | --- | --- |
| Web | implemented (unified assistant demo surface) | apps/web/src/App.tsx, apps/web/src/api.ts, apps/web/src/pages/ChatDashboard.tsx, apps/web/src/components/WorkflowCards.tsx | Browser traffic is centralized through `/api/v1/assistant/chat` and `/api/v1/assistant/actions`; one conversation renders consumer cards/actions and backend-confirmed activity. |
| Mobile | skeleton | apps/mobile/App.tsx | Expo shell only; no API integration. |
| API Gateway | implemented (unified four-domain orchestration) | apps/api-gateway/src/modules/{auth,tools,confirmation,payment,workflow,conversation}, apps/api-gateway/src/modules/conversation/{assistant.controller.ts,assistant.service.ts}, apps/api-gateway/src/clients/{clients.module.ts,service.clients.ts}, apps/api-gateway/src/resilience/, migrations 001-008 | PostgreSQL is the runtime repository in Compose; in-memory Core repository is test-only. Core migration 007 stores one actor/conversation/action execution receipt and safe public response for exact replay; migration 008 adds retryable failures and stale processing lease reclaim. `commitAssistantActionSuccess` atomically appends the action turn/state and marks that receipt `SUCCEEDED`, so a failed commit leaves the old action and `PROCESSING` receipt together for same-key lease reclaim; a different key cannot resurrect it. Generic follow-up selection unions current public actions with authoritative safe Food/Restaurant/Healthcare choice metadata and asks a dynamic clarification when more than one domain is eligible. The unified assistant keeps final/financial operations confirmation-gated, sends only planner-safe state to Agent, and composes Healthcare/Restaurant→Ride only from authoritative domain results. |
| Agent service | implemented (top-level structured planner plus domain subgraphs) | apps/agent-service/src/agents/{assistant_graph.py,graph.py,restaurant_graph.py,healthcare_graph.py,ride_graph.py}, apps/agent-service/src/services/{gateway.py,llm.py}, apps/agent-service/src/api/routes.py | `assistant_graph.py` is the bounded one-conversation planner for Ride, Food, Restaurant, and Healthcare. Gemini first attempts the configured model; confirmed structured-schema/capability failures retry raw output on the same model, while configured-model fallback is limited to quota/rate-limit, temporary provider, timeout/network, or model-unavailable failures. Auth/permission/billing failures stay visible. `/api/v1/status` reports safe model diagnostics. The Agent emits typed plans only and never executes a final side effect. |
| Ride service | implemented (simulation slice) | services/ride-service/src/{main.py,api/rides.py,application/ride_service.py,domain/ride.py,infrastructure/,repositories/}, migrations/versions/20260806_0001_ride_simulation.py, tests/ | Deterministic PostgreSQL-backed quote/booking lifecycle is local/demo-only; Gateway owns public orchestration and two explicit confirmations. |
| Restaurant service | implemented (partial vertical slice) | services/restaurant-service/src/main.py, src/api/v1/, src/infrastructure/, migrations/versions/0001_restaurant_booking.py, migrations/versions/0002_restaurant_idempotency_records.py, migrations/versions/0003_restaurant_legacy_idempotency_backfill.py, seeds/seed.py, tests/test_restaurant_service.py, tests/test_contract_parity.py | PostgreSQL-backed discovery, availability, holds, reservation create/read/update/cancel, durable actor/operation/key replay evidence, additive legacy backfill/runtime promotion, actor auth, and structured response envelope are wired; Gateway/Agent currently orchestrate search/availability/hold/proposal/final create only. Confirmation evidence is owned by Gateway; generated clients remain intentionally absent. |
| Healthcare service | implemented (local booking slice) | services/healthcare-service/src/{main.py,api/routes.py,config.py,database.py,models/medical.py}, migrations/{001_healthcare_booking.sql,002_healthcare_slot_reuse.sql,003_healthcare_provider_catalog.sql}, seeds/{seed_medical.py,import_healthcare_csv.py}, tests/{test_contract_parity.py,test_medical_schema.py,test_postgres_slot_reuse.py,test_routes.py} | PostgreSQL-backed facility/department/doctor catalog and appointment state, actor-scoped holds/payment acknowledgement/cancel, required idempotency, explicit final confirmation, expiry reconciliation, active-slot reuse, and facility metadata returned per provider are wired. Imported doctors without a source consultation price remain discoverable but cannot be held until priced. Payment is a local acknowledgement adapter and is not a provider refund; production provider integration is out of scope. |
| Food service | implemented (vertical slice) | services/food-service/src/application/food_service.py, src/domain/quotes.py, src/api/food.py, src/repositories/food.py, migrations 001-005, seeds/{001_demo_hanoi.sql,import_food_csv.py}, tests/ | PostgreSQL adapter recomputes the canonical quote under cart/catalog/address/voucher locks, exposes actor-scoped address discovery, enforces actor-owned resources, cart/order idempotency, voucher eligibility, transition operation idempotency, due workflow claims, driver locks, and immutable event tables. The CSV importer has populated the local catalog with 239 restaurants and 17,357 menu items using source-ID upserts; source records use explicitly marked approximate Hanoi-center coordinates because the source CSV has no coordinates. |
| Tool/OpenAPI contracts and generated TS clients | implemented (four-domain plus unified assistant contract) | packages/contracts/tools/{tool-request.schema.json,ride-tool-request.schema.json}, packages/contracts/openapi/{food-vertical-slice.yaml,gateway-food-vertical-slice.yaml,restaurant-service-v1.yaml,healthcare-service-v1.yaml,gateway-v1.yaml,agent-service.v1.yaml,ride-service.v1.yaml,gateway-public.v1.yaml} | `gateway-v1.yaml` documents `/api/v1/assistant/chat` and `/api/v1/assistant/actions`; generated clients remain ungenerated because the typed Gateway adapters are hand-owned transport code. |
| Local Compose and database bootstrap | implemented | docker-compose.yml, .env.example, infra/postgres/init/01-create-databases.sh, scripts/validate-env-config.py | All six application containers plus PostgreSQL built and reached healthy status using `.env.example`; bootstrap still runs only for a new postgres_data volume. |
| Migrations and seeds | implemented (four domain slices) | Core migration 001-008, Food migration 001-005, Restaurant Alembic revisions 0001-0003, Healthcare SQL migrations 001-002, Ride Alembic revision, deterministic Food/Restaurant/Healthcare seeds and additive Food/Healthcare CSV importers, scripts/migrate.{ps1,sh}, scripts/seed.{ps1,sh} | Each owner keeps its migration boundary; root helpers apply all current migrations and deterministic seeds without deleting the existing volume. PowerShell Food seeding preserves UTF-8 catalog data. |
| Automated tests and CI | implemented (local integrated scope) | services/{food-service,restaurant-service,healthcare-service,ride-service}/tests/, apps/{api-gateway,agent-service}/test*/, apps/web/package.json, .github/workflows/ci.yml | Local service tests, Gateway lint/build/Jest, Agent pytest/Ruff, application Python Ruff, and Web production build pass; dedicated PostgreSQL tests remain environment-dependent, while the disposable live proof is recorded below. |
| Deployment | planned | no deployment manifest outside local Compose | No production deployment or cloud pipeline is present. |

The unified Agent route now returns a typed `SemanticTurn` and
`PlanningDecision` in addition to the compatibility plan. Both Gemini output
and deterministic fallback pass through the same Core A policy. Gateway owns a
versioned capability snapshot and rejects mismatched capability domain, risk,
confirmation gate, or dependency references before orchestration. Gateway also
persists failed dependents as `BLOCKED` with their blocker and derives
`IN_PROGRESS`, `COMPLETED`, `PARTIAL_SUCCESS`, or `FAILED` from canonical
task state; the model does not choose aggregate workflow status.
The legacy `AssistantPlan` understanding schema, deterministic keyword/slot
fallback, and Gateway follow-up heuristics remain compatibility code. The
repository therefore has a running typed seam, but the final extraction goal
where `assistant_graph.py` contains wiring only is not yet implemented.

## Intended ownership and deployment reading

The current contract inventory also includes `packages/contracts/openapi/healthcare-service-v1.yaml`; the domain and workflow contracts above are the checked-in source of truth for the local integrated slice.

This table describes intended authority, not a promise that an interface exists. The implementation matrix above remains the status source of truth.

| Component | Current status | Intended authority/data owner | Current deployment mode |
| --- | --- | --- | --- |
| Web | implemented (unified Gateway chat) | No authoritative domain data | standalone web demo |
| Mobile | skeleton | No authoritative domain data | standalone mobile shell |
| Gateway | implemented (four-domain orchestration) | Public workflow/audit/idempotency metadata in Core; never domain state | standalone gateway runtime |
| Agent | implemented (structured unified planner) | Approved agent run/checkpoint metadata only | standalone agent runtime |
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
- Root tests/ is reserved for cross-service unit/integration/contract/e2e/evaluation suites; live public E2E coverage is split between tests/e2e/test_food_vertical_slice.py, tests/e2e/test_four_domain_workflows.py, and tests/e2e/test_unified_assistant.py.

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

### BASE SUITES

For this evidence-only pass, the four required service commands and their collection commands were each run exactly once from the owning service directory. The exact stdout summaries were:

- Food (`services/food-service`): `python -m pytest tests -q` -> `22 passed, 3 skipped, 1 warning in 0.45s`; `python -m pytest tests --collect-only -q` -> `25 tests collected in 0.28s`.
- Ride (`services/ride-service`): `python -m pytest tests -q` -> `10 passed, 1 warning in 0.26s`; `python -m pytest tests --collect-only -q` -> `10 tests collected in 0.01s`.
- Restaurant (`services/restaurant-service`): `python -m pytest tests -q` -> `20 passed, 1 skipped, 1 warning in 1.15s`; `python -m pytest tests --collect-only -q` -> `21 tests collected in 0.80s`.
- Healthcare (`services/healthcare-service`): `python -m pytest tests -q` -> `21 passed, 1 skipped, 23 warnings in 0.94s`; `python -m pytest tests --collect-only -q` -> `22 tests collected in 0.60s`.

These are BASE SUITES counts only; Ruff, targeted PostgreSQL, public E2E, and live Gemini evidence are not added to them. Previously recorded Agent, Gateway, and Web checks remain separate and unchanged. No existing `p-018` volume was deleted.

Source reconciliation used repository root `C:/Users/ADMIN/Personal_proj/AIBuildPhase/P-018`, HEAD `6672e988c4cdd4de19a542a0ab4bacfbad216367`, and the captured dirty working-tree status. Every collected service test source is under that root and tracked; no untracked/ignored/outside-root test source contributes to the counts. The apparent `develop.xml` result `21/7/18/18` omitted the content blocks for the four tracked service `tests/test_config.py` files even though its directory index lists them. Those files contribute exactly Food `+4`, Ride `+3`, Restaurant `+3`, and Healthcare `+4`, yielding reproducible repository collection `25/10/21/22`. Exact node IDs and tracked-source proof are recorded in [Testing Strategy](../development/testing-strategy.md). No test was modified for reconciliation.

### TARGETED POSTGRESQL

Disposable PostgreSQL evidence passed Food `3/3` and Gateway Core `5/5`. These targeted counts are separate from BASE SUITES and are not summed into them. Core migrations 001-008 and deterministic seeds were applied only to the disposable acceptance project.

### DETERMINISTIC PUBLIC E2E

The public local E2E source collection command was run in this pass and collected exactly `31 tests`. The previously recorded deterministic disposable-stack runtime evidence remains `31 passed in 164.95s`, zero skipped; it is not rerun in this documentation-only pass. Its Ride recovery test executed two Gateway restarts, Ride/payment survival, same-key exact replay, and different-key rejection. The acceptance project was checked healthy afterward and its containers were disposable; Browser smoke remains `UNVERIFIED` because no browser-control instance was connected.

### LIVE GEMINI SMOKE

The user-authorized local Agent reported `model_mode=gemini`, `api_key_configured=true`, `last_model_call_status=success`, `last_model_used=gemini-3.5-flash-lite`, structured invocation, and no fallback. The public Agent contract returned HTTP 200 with `decision_source=model`; the forced fallback probe recovered on `gemini-3.1-flash-lite`; and the public Gateway Food two-turn smoke returned HTTP 201 twice. Five demo-critical flows were run once each: Food full ordering passed after correcting the disposable Agent container's internal Gateway URL; Restaurant explicit-confirmation passed; Healthcare symptom flow had one assertion-only first-step mismatch (category C, no state/action bug); Healthcare-to-Ride authoritative handoff passed; and Food/Healthcare ambiguity clarification passed. The live demo set is therefore `4/5` assertion passes, with the remaining failure accepted as model-wording/assertion nondeterminism under the test policy.

The prior live-provider run remains separate from deterministic acceptance: `25 passed, 6 failed`, classified as `3 B/transient` and `3 C/assertion-only`; no failure was classified D or E. Safe classification of the six failures is recorded in `docs/development/testing-strategy.md` and `job.txt`; the prior output did not capture `decision_source`, `last_model_used`, or fallback state, so those fields remain `not captured` rather than inferred. `llm.py` omits `temperature`, `top_p`, and `top_k` for every Gemini 3 name, including an optional `models/` prefix, and the Restaurant adapter uses the shared `build_chat_model` path. No key, raw prompt, authorization header, or provider payload was printed.

## Static, security, and boundaries

- `python -m compileall -q apps/agent-service/src services scripts`, `python scripts/check-migration-parity.py` (`15 files`), `python scripts/validate-env-config.py` (`81 root variables, 77 Compose variables`), `docker compose --env-file .env.example config --quiet`, `bash -n scripts/start-all.sh`, `bash scripts/tests/test-start-all-host-normalization.sh`, and `git diff --check` all passed. The diff check emitted only existing LF/CRLF warnings.
- Direct Git inspection listed tracked `.github/workflows/ci.yml`, `pnpm-lock.yaml`, and `apps/web/package-lock.json`; the current workflow runs Agent/Ride/Restaurant/Healthcare/Food lint and tests in one shared Python job, while Gateway uses frozen pnpm install and Web uses `npm ci`. The workflow still runs Ruff and pytest for all five Python service owners, plus the dedicated integration/build jobs. Frozen Gateway install and Web `npm ci` both passed; lockfiles were not regenerated.
- `npm audit --json` and `npm audit --omit=dev --json` each reported one high advisory: transitive `nanoid@3.3.16` via `vite@6.4.3 -> postcss@8.5.25`, affected `<3.3.17`, `fixAvailable=true`; patched `3.3.17`/`3.3.18` fit the existing `^3.3.16` range. The omit-dev result remains nonzero because Vite is manifest-classified as a production dependency. Deployment inspection classifies the chain as build tooling only: Vite runs only in the Docker builder, the final image is static Nginx output, source/dist contain no Nanoid/PostCSS/custom-generator code, and PostCSS calls `nanoid(6)`, not the vulnerable zero-size path. It is not shipped or exploitable in the deployed browser runtime; no dependency change was made. Full details are in [Testing Strategy](../development/testing-strategy.md).
- `.gemini/settings.json` contains only the `STITCH_API_KEY` environment expansion; no literal credential was printed or used. `apps/agent-service/src/agents/tools/medical_tools.py` remains absent, and Web/Agent boundary scans found no direct internal service calls.
- Browser smoke: `UNVERIFIED`.

SECURITY ACTION REQUIRED BY USER: revoke/rotate the previously exposed Stitch API key.

## Change rules derived from the current state

Business API changes must add a versioned OpenAPI contract, any needed generated client, API/contract tests, and matching documentation. A schema change needs an owned migration before an optional deterministic seed, plus data-architecture and test updates. Food order placement and cancellation remain separate confirmation actions; final execution revalidates authoritative Food state.

## Incremental delivery guidance

Implement one walking vertical slice at a time: user request -> gateway -> agent intent/tool selection -> provider lookup -> draft/quote -> user confirmation -> domain booking creation -> structured result. This is a target sequence, not a running flow. Add confirmation, idempotency, and audit before its important side effects; a target box does not need to become a separate physical service/database before the first end-to-end slice is complete.
