# Security Architecture Baseline

This document separates behavior implemented in Phase 0 from the authentication architecture locked for Phase 1. It does not claim that a production identity/session system exists today.

## Implemented now

- Browser/mobile traffic terminates at the Gateway. The Gateway uses the configured `GATEWAY_CORS_ORIGINS` allowlist; wildcard origins are rejected in every environment and localhost origins are rejected in production. Gateway CORS does not enable credentialed cookies in Phase 0 because the current public contract uses Bearer demo auth.
- Gateway security headers are applied to responses: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a deny-by-default API CSP, a restrictive `Permissions-Policy`, and HSTS in production.
- Gateway JSON and URL-encoded bodies have an explicit default 262,144-byte limit, configurable through `GATEWAY_BODY_LIMIT_BYTES`, with a safe `REQUEST_BODY_TOO_LARGE` response.
- A bounded process-local limiter is wired only to current Gateway routes: demo login is 5 requests per 60 seconds per client IP, unified assistant chat is 30 per 60 seconds, and assistant actions are 20 per 60 seconds. A 5-per-60-second profile is reserved for future register/forgot/reset/refresh routes but no such route is implemented. A distributed limiter remains a deployment requirement for a multi-instance production Gateway; Phase 0 does not add Redis or another queue/cache.
- The Gateway error filter and parser middleware expose `code`, safe `detail`, `retryable`, and `request_id` without stack traces, credentials, passwords, raw prompts, provider payloads, or chain-of-thought.
- `DemoAuthGuard` fails closed unless `APP_ENV` is `development` or `test` and `DEMO_AUTH_ENABLED=true`. Production and disabled-mode requests return `DEMO_AUTH_DISABLED`, missing credentials return `AUTHENTICATION_REQUIRED`, and malformed, invalid-signature, or expired tokens return the stable safe `AUTHENTICATION_FAILED` error.
- `GEMINI_API_KEY` is supplied only to the Agent container through the explicit Compose mapping. The Agent reports only a boolean configured flag and safe model diagnostics; the key value is never copied to the browser, Gateway, docs, fixtures, or logs. The current local environment has a user-provided Gemini key in the Agent service environment; no key value was read or printed during this Phase 0 pass.
- Core audit records keep actor, operation, correlation, and safe resource metadata for current workflows. Raw conversation/reasoning retention is not introduced by this phase.

## Origin, cookie, and CSRF policy

Phase 0 public calls use a Bearer access token and do not rely on browser cookies. The Gateway rejects wildcard CORS and does not set `Access-Control-Allow-Credentials`.

Phase 1 may introduce an HttpOnly refresh cookie only under the auth ADR. Cookie-authenticated state-changing requests must validate `Origin` against the configured allowlist, use an exact-origin `Referer` fallback only when policy permits, and require the selected CSRF token strategy. Missing or foreign origin/referer evidence is rejected; CORS is not treated as CSRF protection.

Internal service authentication uses the service token plus actor/resource assertions where required. Domain services independently validate the request and never trust an Agent/model claim as authority.

## Secret and audit policy

Secrets are process environment or deployment-secret inputs, not source, OpenAPI examples, browser configuration, logs, or raw test fixtures. Passwords are never logged or stored in plaintext. Provider keys are redacted from diagnostics. Audit metadata is bounded and excludes raw prompts, chain-of-thought, full payment credentials, and unnecessary sensitive PII.

## Explicit non-goals for Phase 0

Real user/session tables, register, refresh, reset-password, logout, Argon2id password hashing, refresh-token rotation, and production payment providers are Phase 1+ work. Demo auth remains development/test-only, production validation rejects enabling it, and a signed demo token is not an exception to that guard.
