# API Conventions

Public gateway routes use `/api/v1`; optional gateway-internal routes use `/internal/v1`; domain services use `/v1`. Use JSON `snake_case`, ISO 8601 datetimes with timezone, and integer money amounts plus ISO currency (for example `{ "amount": 128000, "currency": "VND" }`).

Successful responses use:

```json
{ "data": {}, "meta": { "request_id": "cor_...", "timestamp": "2026-08-05T16:00:00+07:00" } }
```

Errors use RFC-7807-inspired JSON: `type`, `title`, `status`, `code`, safe `detail`, `retryable`, and `request_id`; never return a stack trace. Collection responses use cursor or explicit `limit`/`offset` pagination with metadata.

`X-Correlation-Id` is accepted/generated for every request. `X-Workflow-Id` and `X-Tool-Call-Id` apply to orchestrated workflows. `Idempotency-Key` is mandatory for a retried write. Internal calls require service authentication. Retry only timeout/transient failures, with bounded backoff; do not retry final payment/booking work without the same idempotency key. Standard status codes apply: 200/201 success, 202 accepted, 400/401/403/404/409/422 client errors, and 429/5xx only where appropriate.
