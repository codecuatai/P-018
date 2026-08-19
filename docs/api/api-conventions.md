# API Conventions

Public Gateway routes use `/api/v1`; optional Gateway-internal routes use `/internal/v1`. The checked-in internal domain prefixes are currently split by the incremental slices:

| Boundary | Prefix |
| --- | --- |
| Public Gateway | `/api/v1` |
| Restaurant Service | `/v1` |
| Ride Service | `/v1` |
| Food Service | `/api/v1` |
| Healthcare Service | `/api/v1` |

This is a legacy/incremental contract split; do not rename working service routes for cosmetic uniformity immediately before a demo. Use JSON `snake_case`, ISO 8601 datetimes with timezone, and integer money amounts plus ISO currency (for example `{ "amount": 128000, "currency": "VND" }`). The public Food Gateway contract is [gateway-food-vertical-slice.yaml](../../packages/contracts/openapi/gateway-food-vertical-slice.yaml); the Food-owned internal contract remains [food-vertical-slice.yaml](../../packages/contracts/openapi/food-vertical-slice.yaml).

The canonical route inventory is [api-inventory.md](api-inventory.md). Shared primitives and the minimum response envelopes are versioned in [shared-primitives.v1.yaml](../../packages/contracts/openapi/shared-primitives.v1.yaml). The current Gateway keeps legacy Ride and vertical workflow routes for compatibility; they are not permission to add new browser callers or bypass the unified assistant confirmation boundary.

The shared `Address` contract requires `id`, `label`, `address_text`, `latitude`, `longitude`, and `city`; `ward` and `district` remain optional. The canonical actor-owned saved-address resource is Gateway `/api/v1/addresses`, persisted in Core migration `010_core_personal_context.sql`. Food still accepts an immutable `address_snapshot` on quote/preview/order calls and validates the actor before using it; its legacy `/api/v1/addresses` shape is not Core authority.

A saved or default address is reusable context, not implicit permission to choose
a Food delivery destination. Checkout asks where the order should be delivered
before resolving a saved-address label or accepting a new concrete address. If
`address_text` is changed without replacement coordinates, Core clears the old
coordinates and location metadata instead of applying a delivery quote to a
stale point; the updated manual address remains saved and can be geocoded later.

The unified consumer conversation uses `POST /api/v1/assistant/chat` and
`POST /api/v1/assistant/actions`, documented in
[`gateway-v1.yaml`](../../packages/contracts/openapi/gateway-v1.yaml). Its
response contains `conversation_id`, safe assistant text, authoritative result
cards, explicit action descriptors, and completed cards. It does not expose
Agent plans, raw tool requests, workflow state, state patches, or internal
confirmation records. The action endpoint requires a trimmed, non-blank
`Idempotency-Key` of 1–255 characters; clients reuse the same key for a retry
of the same action. Final and financial actions remain explicit confirmation
steps. Consumer cards are discriminated by `kind` and omit internal fields
such as `workflow_id`, `confirmation_id`, `tool_request`, and `resource_version`.
The `ride_timing_conflict` card is a truthful no-booking result when a
Healthcare-dependent departure is impossible. Healthcare appointment cards may
carry the domain-owned facility name/address; the Gateway does not invent or
persist that authority. Restaurant hold and completed-reservation cards have
separate schemas so a hold never pretends to have a final reservation code.
The Gateway validates required reservation confirmation fields and normalizes
legacy timezone-less Healthcare timestamps to the `Asia/Ho_Chi_Minh`
domain timezone before exposing an ISO 8601 value.

Conversation-only chitchat/advisory turns return safe assistant text without
replaying prior cards or actions, while pending workflow state remains
available for a later service turn. A context switch may retire eligible
unfinished orchestration tasks as `DISCARDED`; this is not a public claim
that any domain resource was cancelled. Active bookings/orders and final or
financial state still require the domain-owned cancellation workflow and its
explicit confirmation policy.

Successful responses use:

```json
{ "data": {}, "meta": { "request_id": "cor_...", "timestamp": "2026-08-05T16:00:00+07:00" } }
```

Errors use RFC-7807-inspired JSON: `type`, `title`, `status`, `code`, safe `detail`, `retryable`, and `request_id`; never return a stack trace. Collection responses use cursor or explicit `limit`/`offset` pagination with metadata.

The minimum public success contract is `{ data, meta: { request_id } }`. A list uses `{ data: { items }, meta: { request_id, pagination: { cursor, has_more } } }`. Extra safe metadata such as `timestamp` or a compatibility `actor_id` may remain on an existing endpoint, but must not contain credentials, raw prompts, internal confirmation IDs, provider payloads, or chain-of-thought.

`X-Correlation-Id` is accepted/generated for every request. `X-Workflow-Id` and `X-Tool-Call-Id` apply to orchestrated workflows. Internal calls require service authentication. Standard status codes apply: 200/201 success, 202 accepted, 400/401/403/404/409/422 client errors, and 429/5xx only where appropriate.

## Authentication contract

The Phase 1 authentication contract is versioned in
[`gateway-auth-v1.yaml`](../../packages/contracts/openapi/gateway-auth-v1.yaml).
Register/login/refresh return `{ data: { access_token, token_type, expires_in,
user }, meta }`; they never return a raw refresh token in JSON. The Gateway
sets the refresh token as an opaque `HttpOnly`, `SameSite=Lax` cookie scoped to
`/api/v1/auth` (and `Secure` outside local HTTP development). The browser
retains the access token only in memory and calls refresh with
`credentials: "include"`.

Refresh, logout, logout-all, session revocation and password change validate a
trusted Origin or Referer when a browser cookie can be affected. A refresh
replay returns the safe `REFRESH_TOKEN_REUSED` error after the whole token
family is revoked. `GET /auth/sessions` exposes logical session-family metadata
only; no endpoint exposes a raw or hashed refresh token. `POST /auth/forgot-
password` always returns a generic accepted result. Its optional test-only
reset capture is forbidden in production and is not a browser feature.

## Write safety (target contract expectation)

Every write that may be retried or cause a side effect receives `Idempotency-Key` from its first request, not only after a failure. The domain scopes it to the authenticated actor, operation, and retention window; the same key and normalized payload return the same logical result, while a changed payload is rejected with a safe conflict. Gateway propagation does not replace the domain guarantee. Do not log raw sensitive payloads solely to implement idempotency.

Final/financial confirmation is not a boolean. The contract binds it to the actor, action, normalized payload or hash, quote/resource version, price/currency, expiry, issuance/consumption time, and one-time audit evidence. The Food slice implements this through Gateway confirmation and Payment Sandbox modules. Core persistence is PostgreSQL at runtime with an in-memory adapter only for deterministic tests; additive claim/idempotency/payment/refund/recovery/provider fields are in `apps/api-gateway/migrations/003_core_atomicity.sql`, `004_core_recovery.sql`, `005_core_payment_provider_saga.sql`, and `006_core_payment_recovery_claims.sql`. Assistant action receipts are additive in `apps/api-gateway/migrations/007_core_assistant_action_executions.sql` and `008_core_assistant_action_recovery.sql`; successful retries return the stored sanitized response, retryable failures and stale processing leases can be reclaimed with the same key, and a different key cannot consume the same action. Multi-service plan state and step idempotency are additive in `apps/api-gateway/migrations/011_core_multi_service_workflows.sql`. Food order creation requires `expected_snapshot_hash`, `expected_cart_version`, `expected_amount`, `expected_currency`, and `expected_quote_version`; Food recomputes the quote under row locks before inserting an order.

## Phase 2–9 public additions

`GET/POST /api/v1/conversations`, actor-scoped conversation detail/update/archive/delete, `/api/v1/users/me`, `/api/v1/addresses`, `/api/v1/location`, `/api/v1/healthcare/patients`, `/api/v1/history`, `/api/v1/services`, and `/api/v1/rides/{bookingId}/tracking` are Gateway-owned public surfaces. Each calls Core or a typed domain client; the Web never calls a domain service directly. Service browsing reports partial/degraded dependencies rather than manufacturing results. The Web's “Continue with AI” entry creates a Core conversation with the selected service context before the first prompt is sent. Healthcare patient records remain Healthcare-owned; the Gateway only enforces the public actor boundary and forwards the request.

`POST /api/v1/recommendations/rank` is a deterministic V1 ranking adapter. It consumes authoritative candidates and combines relevance, distance, ETA, price, and rating; suspicious default coordinates are excluded from distance scoring. It is deliberately not an ML claim and does not create a booking.

The Gateway-only Service Hub action surface is documented in
[`gateway-v1.yaml`](../../packages/contracts/openapi/gateway-v1.yaml): Food
restaurant/menu/cart reads and writes, Restaurant detail/availability/hold,
Healthcare doctor/slot actions, and Ride quote-based prepare/final confirmation
are all typed Gateway routes. Domain services remain authoritative; every
retryable write carries `Idempotency-Key`, and final Ride/Restaurant/Healthcare
actions pass through explicit confirmation evidence. `GET /api/v1/history`
accepts `service`, `status`, `from`, `to`, `page`, and `page_size` filters.

Assistant responses include `workflow_status` (`PENDING`, `RUNNING`,
`COMPLETED`, `PARTIAL_SUCCESS`, or `FAILED`) and safe task-error cards. A
failed dependent task is reported as `DEPENDENCY_BLOCKED`; independent tasks
continue when policy allows. A final Ride failure never auto-cancels a
completed Healthcare appointment. History detail may include a sanitized
Core payment/receipt/refund summary and never exposes provider references.

`POST /api/v1/workflows/multi-service/plan` persists a read/planning state machine for `restaurant_ride`, `healthcare_ride`, and independent `food_healthcare` work. The request carries only an explicitly selected Restaurant/Healthcare resource ID and its authority; the Gateway re-reads the active record through the owning typed client before creating the destination snapshot. Caller/model-supplied address or coordinates are rejected rather than treated as authoritative. Step results and explicit compensation results are actor-scoped, idempotent, durable in Core, and expose `PENDING`, `RUNNING`, `COMPLETED`, `PARTIAL_SUCCESS`, `FAILED`, `COMPENSATING`, or `RECOVERY_REQUIRED`. Healthcare compensation is `NONE`; a Ride failure never auto-cancels a Healthcare appointment.
