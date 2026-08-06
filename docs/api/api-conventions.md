# API Conventions

Public gateway routes use `/api/v1`; optional gateway-internal routes use `/internal/v1`; domain services use `/v1`. Use JSON `snake_case`, ISO 8601 datetimes with timezone, and integer money amounts plus ISO currency (for example `{ "amount": 128000, "currency": "VND" }`).

Successful responses use:

```json
{ "data": {}, "meta": { "request_id": "cor_...", "timestamp": "2026-08-05T16:00:00+07:00" } }
```

Errors use RFC-7807-inspired JSON: `type`, `title`, `status`, `code`, safe `detail`, `retryable`, and `request_id`; never return a stack trace. Collection responses use cursor or explicit `limit`/`offset` pagination with metadata.

`X-Correlation-Id` is accepted/generated for every request. `X-Workflow-Id` and `X-Tool-Call-Id` apply to orchestrated workflows. Internal calls require service authentication. Standard status codes apply: 200/201 success, 202 accepted, 400/401/403/404/409/422 client errors, and 429/5xx only where appropriate.

## Write safety (target contract expectation)

Every write that may be retried or cause a side effect receives `Idempotency-Key` from its first request, not only after a failure. The domain scopes it to the authenticated actor, operation, and retention window; the same key and normalized payload return the same logical result, while a changed payload is rejected with a safe conflict. Gateway propagation does not replace the domain guarantee. Do not log raw sensitive payloads solely to implement idempotency.

Final/financial confirmation is not a boolean. The contract binds it to the actor, action, normalized payload or hash, quote/resource version, price/currency, expiry, issuance/consumption time, and one-time audit evidence. A confirmation cannot be reused after a material payload, price, or term change; the domain validates it before its final state transition. The current repository has not implemented this flow.
