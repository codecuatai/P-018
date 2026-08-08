# Restaurant Service Improvement Plan

## 1. Scope

This plan upgrades `services/restaurant-service/` from an in-memory demo into a reliable domain service for dine-in table reservations. Implementation code and owned migrations remain inside the service; required API/data-architecture documentation and versioned contracts may also be updated.

The implementing agent must not modify `apps/agent-service/`, `apps/api-gateway/`, another service/database, or web/mobile UI, and must not change Compose/root environment behavior unless a verified configuration change is required. If the API changes, update the versioned OpenAPI contract and generated client where applicable; if the schema changes, update the canonical data-architecture documentation. The result is a stable REST/JSON service ready for a future Gateway; this task does not implement Gateway-Agent integration.

## 2. Current Problems

- Repository data is in memory and disappears on restart.
- Each router creates its own application service/repository instance.
- Availability uses total capacity and an average table size, not real tables.
- Availability and creation are not one transaction, so concurrent requests can overbook.
- There are no holds, expiry, table assignment, resource versions, or opening-hours validation.
- Idempotency is optional and changed payloads are not rejected.
- `INTERNAL_SERVICE_TOKEN` is configured but not enforced by business routes.
- Errors are generic `400` responses with raw exception text.
- Migrations, deterministic seeds, persistence tests, and concurrency tests are missing.

## 3. Invariants

1. Restaurant owns restaurants, tables, holds, reservations, and reservation lifecycle.
2. Restaurant accesses only `xone_restaurant` through its own repository/unit-of-work.
3. No agent, gateway, Food, shared ORM, or cross-service business import.
4. Domain rules remain outside routers.
5. Every side-effecting write requires an idempotency key.
6. Same actor + operation + key + normalized payload returns the same logical result.
7. Same key with a changed normalized payload returns `409`, never the old result silently.
8. Model/user text cannot grant authorization.
9. Logs exclude tokens, raw prompts, unnecessary PII, and full sensitive bodies.
10. Final reservation creation must carry trusted actor context and the Gateway's validated booking-confirmation context; the Restaurant service does not invent or bypass user confirmation.

## 4. Target Structure

```text
services/restaurant-service/
  src/
    api/
    application/
    domain/
    models/
    repositories/
    infrastructure/
  migrations/
  seeds/
  tests/
```

Runtime flow:

```text
router -> schema/auth -> application use case -> domain rules
       -> unit of work/transaction -> PostgreSQL repository
```

Keep FastAPI, port `8102`, `/health/live`, and `/health/ready`. Do not use runtime `create_all()`.

## 5. Database Model

Use SQLAlchemy and Alembic. Add the PostgreSQL driver needed by the chosen SQLAlchemy configuration to the service manifest.

### 5.1 Restaurants

Create `restaurants` with stable ID, name, structured city/area location, cuisine, budget range, bounded rating, optional description/image URL, IANA timezone, active flag, and timestamps. Choose UUID or the current string IDs and use one strategy consistently.

### 5.2 Opening hours

Create `restaurant_opening_hours` with restaurant ID, day of week, local opening/closing times, and closed/split-period support if required. Do not use the existing free-form `opening_hours` string as the source of truth.

### 5.3 Tables

Create `restaurant_tables` with restaurant ID, stable table code, positive capacity, seating type, active flag, and timestamps. Add unique `(restaurant_id, table_code)` and indexes for restaurant/active/capacity.

### 5.4 Holds

Create `reservation_holds` with hold code, actor ID, restaurant/table IDs, party size, UTC start/end, expiry, status (`ACTIVE`, `CONSUMED`, `EXPIRED`, `CANCELLED`), resource version, idempotency key, request hash, and timestamps.

An active hold blocks its assigned table. MVP expiry may be evaluated lazily during reads/writes; do not add a worker or queue.

### 5.5 Reservations

Create `reservations` with reservation code, actor ID, restaurant/table IDs, party size, UTC start/end, status (`CONFIRMED`, `MODIFIED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`), bounded special requests, optional hold ID, resource version, idempotency key, request hash, and timestamps.

Add indexes for restaurant/time/status and actor/status/time. Add a database uniqueness strategy for idempotency scoped by actor and operation.

### 5.6 Events

Create an event model for `CREATED`, `MODIFIED`, `CANCELLED`, `EXPIRED`, `COMPLETED`, and other lifecycle transitions. Because `EXPIRED` may belong to a hold, either use `aggregate_type`/`aggregate_id` or separate hold and reservation event tables. Store aggregate ID, event type, actor/reference ID, correlation ID if supplied, timestamp, and safe metadata only. Write the event in the same transaction as the state change.

## 6. Domain Rules

### Time

- Accept timezone-aware ISO-8601 input; reject naive datetimes.
- Convert to UTC for storage/comparison and use the restaurant timezone for opening-hour validation.
- Define a documented reservation duration policy, such as 90 or 120 minutes.
- Reject past starts and invalid intervals.

### Table allocation

- Allocate a real active table with capacity at least party size.
- Prefer the smallest suitable table, then deterministic table ID/order.
- Apply seating preference when supplied.
- Do not split a party across tables in the first slice.
- A table is blocked by overlapping active holds or non-cancelled/non-expired reservations.
- Serialize allocation per candidate table with row locks (for example `SELECT ... FOR UPDATE`) inside the same transaction as the hold/reservation write, or use an equivalent PostgreSQL exclusion constraint on the table/time range. A pre-check followed by an unlocked insert is not sufficient.
- When an existing reservation is moved or its party size changes, release the old allocation and allocate the new table/time atomically.

### Availability

- Query real tables, not aggregate `total_capacity`.
- Return `404` for unknown/inactive restaurant.
- Return `available=false` for no capacity, not a server error.
- Return a resource version when a later hold/confirmation depends on freshness.
- Treat `MODIFIED` consistently: if it remains a status, document that it is still active and blocks availability; otherwise keep the reservation in `CONFIRMED` and record modification as an event.

### Holds

- Allocate a table and create the hold in one transaction.
- Require actor and idempotency key.
- Verify actor, status, expiry, restaurant/table, time, party size, and resource version when consuming.
- Consume hold and create reservation atomically.

### Lifecycle

```text
ACTIVE HOLD -> CONFIRMED RESERVATION
CONFIRMED -> MODIFIED
CONFIRMED/MODIFIED -> CANCELLED
CONFIRMED/MODIFIED -> COMPLETED or NO_SHOW
```

Reject invalid transitions, cross-actor changes, changes after cancellation/completion, and unavailable table changes. Write the lifecycle event in the same transaction as the state change.

## 7. API Contract

All domain routes use `/v1`. Preserve existing routes where practical and document any compatibility behavior in the service README.

Successful responses follow the repository API convention: `{ "data": ..., "meta": { "request_id": ..., "timestamp": ... } }`. Collection responses put items and pagination metadata under `data`/`meta`. If a legacy route must temporarily return an unwrapped response, document the compatibility exception and test it.

### Authentication

Require `X-Internal-Service-Token` for non-health routes and compare it to `INTERNAL_SERVICE_TOKEN` with constant-time comparison. If an existing repository convention specifies another header, use that convention consistently. Health probes may remain unauthenticated.

Actor identity must come from trusted authenticated request context, not from an arbitrary `user_id` supplied in the request body. If the internal protocol does not yet define actor propagation, document and implement a minimal trusted actor header/context contract for Gateway calls, with operator authorization explicitly separated from normal actor authorization. Do not authorize from arbitrary request/model text.

### Discovery

`GET /v1/restaurants` supports bounded location, cuisine, budget, limit, and cursor/offset pagination. Return items, total, and pagination metadata. `GET /v1/restaurants/{restaurant_id}` returns `404` for unknown/inactive restaurants.

### Availability

Preserve `POST /v1/restaurants/{restaurant_id}/availability`. Request contains timezone-aware `start_at` (or explicitly documented local time plus timezone), party size, duration/default policy, and optional seating type. Response contains restaurant ID, normalized UTC/display interval, availability, safe table summary/reference, resource version, and safe code/message.

### Hold

Add `POST /v1/reservation-holds`. Require `Idempotency-Key` and actor context. Return `201` for a new hold, the same logical result for replay, and `409` for no table, changed idempotency payload, stale version, or other conflict.

### Reservation

Keep `POST /v1/reservations`. Require `Idempotency-Key`, trusted actor context, and a validated hold or an explicitly documented Gateway booking-confirmation context. The service must verify actor, action, normalized payload/hash, resource version, expiry, and one-time-use evidence before the final state transition; it must not treat a boolean or model text as confirmation. Return `201` only after the transaction commits. Replays return the same logical result.

### Read/update/cancel

- Keep `GET /v1/reservations/{id}`.
- Prefer `PATCH /v1/reservations/{id}` for supported changes; retain `PUT` only if compatibility is required.
- Prefer explicit `POST /v1/reservations/{id}/cancel`; preserve `DELETE` only with documented semantics.
- Require actor authorization and idempotency for update/cancel writes.
- Distinguish `404`, `403`, `409`, and `422`.

### Errors

Use a safe structured error with `type`, `title`, `status`, `code`, `detail`, `retryable`, and `request_id` where available. Never return stack traces, SQL errors, or raw Python exception text.

## 8. Implementation Phases

### Phase 1: Application wiring

- Introduce one app-scoped repository/unit-of-work dependency.
- Remove module-level `_service` instances from routers.
- Add typed exceptions: not found, forbidden, validation, conflict, stale resource, unavailable capacity.
- Add request/correlation ID extraction without logging bodies.

Acceptance: a reservation created through one route is visible to availability/read routes through the same dependency; current tests pass.

### Phase 2: Persistence

- Configure SQLAlchemy engine/session from `DATABASE_URL`.
- Configure Alembic inside the service.
- Add ORM models and repository interfaces.
- Add initial migration in `migrations/`.
- Add deterministic Restaurant-only seed data in `seeds/`.
- Replace in-memory runtime wiring.

Acceptance: data survives restart; tests can isolate database state; no runtime schema creation.

### Phase 3: Table availability

- Add table/opening-hour models and seeds.
- Normalize timezone-aware intervals.
- Implement overlap queries and deterministic allocation.
- Add transaction-safe checks and resource-version handling.

Acceptance: tests cover exact capacity, duration, opening hours, timezone conversion, overlaps, and no false availability.

### Phase 4: Holds

- Add hold model, repository, schemas, endpoints, expiry, consume, and cancel rules.
- Allocate table atomically.

Acceptance: concurrent holds for one table allow one success; expired holds no longer block; replay is idempotent.

### Phase 5: Correct writes

- Require idempotency for create/update/cancel.
- Normalize payloads and calculate stable request hashes.
- Scope idempotency by actor and operation.
- Add database uniqueness and conflict handling.
- Use transaction/row locking around allocation and writes.
- Add reservation events.

Acceptance: same request replay is stable, changed payload returns `409`, and concurrent requests cannot overbook.

### Phase 6: Auth and authorization

- Enforce internal token on domain routes.
- Derive/validate actor context.
- Prevent cross-actor reads/updates/cancels unless a documented operator role is added.
- Test missing/invalid/valid token and actor mismatch.

Acceptance: unauthenticated business calls fail safely and cross-actor access is rejected.

### Phase 7: API and operations

- Implement structured errors/status codes.
- Add pagination and bounded filters.
- Add OpenAPI descriptions/examples in service code.
- Add or update the versioned OpenAPI contract and generated client where applicable; do not hand-edit generated output.
- Add safe logs and request IDs.
- Ensure readiness reports only dependencies actually checked.
- Update service README/migration/seed documentation and, for schema/API changes, the canonical data-architecture/API documentation required by repository rules.

Acceptance: generated OpenAPI matches implementation and every error case has contract coverage.

### Phase 8: Verification and handoff

- Run unit, API, integration, concurrency, auth, and idempotency tests.
- Run migration upgrade from an empty database and rollback/compatibility checks where supported.
- Run container smoke tests using existing Compose configuration without modifying Compose.
- Verify health, discovery, availability, hold, reservation, update, cancel, and replay behavior.
- Report remaining limitations honestly; do not claim Gateway/Agent integration.

## 9. Test Matrix

### Domain

- Invalid party size/interval, past time, naive datetime.
- Closed/outside-hours restaurant.
- Exact-fit and insufficient tables.
- Seating preference.
- Overlapping holds/reservations.
- Hold expiry/consumption.
- Valid/invalid lifecycle transitions.

### API

- Schema boundaries and unknown fields.
- `404` unknown resource.
- `403` actor mismatch.
- `409` table conflict, stale version, changed idempotency payload.
- Safe `422` validation.
- Internal token missing/invalid/valid.
- Trusted actor propagation, body `user_id` mismatch/rejection, and booking-confirmation evidence validation.
- Successful response envelope and documented legacy compatibility behavior.
- Pagination/filter behavior.

### Persistence/concurrency

- Migration from empty database and deterministic seeds.
- Restart persistence and transaction rollback.
- Unique idempotency constraint.
- Atomic reservation/event writes.
- Two concurrent holds/reservations for one table: only one succeeds.
- Concurrent same-key retry returns one logical result.

### Security/logging

- No business route bypasses auth.
- No cross-actor access.
- No SQL errors/stack traces in responses.
- No token or sensitive body logging.

## 10. Definition of Done

- All implementation code, migrations, seeds, and service-owned tests are under `services/restaurant-service/`; required contract and architecture documentation is updated in the same patch.
- PostgreSQL is the runtime source of truth; no in-memory repository remains in runtime wiring.
- Restaurant, table, opening-hour, hold, reservation, and event ownership is explicit.
- Actual tables and intervals determine availability.
- Holds, expiry, resource versions, transactions, and idempotency work under concurrency.
- Internal auth and actor authorization are enforced.
- API responses/errors are stable and represented in generated OpenAPI.
- Successful responses follow the documented envelope, or any legacy exception is explicitly documented and tested.
- Migrations and deterministic seeds work from an empty database.
- Tests cover domain, API, persistence, concurrency, idempotency, authorization, and safe errors.
- Swagger/API scripts can demonstrate the service without a UI.
- The service is described as integration-ready, not Gateway/Agent-integrated.

## 11. Verification

Run from `services/restaurant-service/`:

```powershell
python -m pytest -q
ruff check src tests
python -m compileall -q src tests
```

After Alembic is configured:

```powershell
alembic upgrade head
alembic downgrade -1
```

Run downgrade only for migrations whose rollback is explicitly supported; otherwise run the documented compatibility/rollback check without destructive data loss. At repository level, run:

```powershell
python scripts/validate-env-config.py
docker compose --env-file .env.example config --quiet
git diff --check
```

Do not claim Docker image/build/smoke success unless those checks were actually run.

## 12. Handoff Rules

- Read `AGENTS.md` and all Restaurant files before editing.
- Run `git status --short` before and after work; preserve unrelated changes.
- Use `apply_patch` for manual edits.
- Keep each phase reviewable and run tests before the next phase.
- Do not silently change existing API semantics; preserve routes or document compatibility.
- Do not add UI, queues, Redis, Kubernetes, service mesh, multi-agent logic, payment, or cross-service database access.
- Report exact checks and remaining limitations at handoff.
