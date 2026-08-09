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
persist that authority.

Successful responses use:

```json
{ "data": {}, "meta": { "request_id": "cor_...", "timestamp": "2026-08-05T16:00:00+07:00" } }
```

Errors use RFC-7807-inspired JSON: `type`, `title`, `status`, `code`, safe `detail`, `retryable`, and `request_id`; never return a stack trace. Collection responses use cursor or explicit `limit`/`offset` pagination with metadata.

`X-Correlation-Id` is accepted/generated for every request. `X-Workflow-Id` and `X-Tool-Call-Id` apply to orchestrated workflows. Internal calls require service authentication. Standard status codes apply: 200/201 success, 202 accepted, 400/401/403/404/409/422 client errors, and 429/5xx only where appropriate.

## Write safety (target contract expectation)

Every write that may be retried or cause a side effect receives `Idempotency-Key` from its first request, not only after a failure. The domain scopes it to the authenticated actor, operation, and retention window; the same key and normalized payload return the same logical result, while a changed payload is rejected with a safe conflict. Gateway propagation does not replace the domain guarantee. Do not log raw sensitive payloads solely to implement idempotency.

Final/financial confirmation is not a boolean. The contract binds it to the actor, action, normalized payload or hash, quote/resource version, price/currency, expiry, issuance/consumption time, and one-time audit evidence. The Food slice implements this through Gateway confirmation and Payment Sandbox modules. Core persistence is PostgreSQL at runtime with an in-memory adapter only for deterministic tests; additive claim/idempotency/payment/refund/recovery/provider fields are in `apps/api-gateway/migrations/003_core_atomicity.sql`, `004_core_recovery.sql`, `005_core_payment_provider_saga.sql`, and `006_core_payment_recovery_claims.sql`. Assistant action receipts are additive in `apps/api-gateway/migrations/007_core_assistant_action_executions.sql` and `008_core_assistant_action_recovery.sql`; successful retries return the stored sanitized response, retryable failures and stale processing leases can be reclaimed with the same key, and a different key cannot consume the same action. Food order creation requires `expected_snapshot_hash`, `expected_cart_version`, `expected_amount`, `expected_currency`, and `expected_quote_version`; Food recomputes the quote under row locks before inserting an order.
