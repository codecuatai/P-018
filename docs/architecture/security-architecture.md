# Security Architecture

## Implemented Phase 1 baseline

- Browser and mobile traffic terminate at the Gateway. The configured
  `GATEWAY_CORS_ORIGINS` allowlist is exact; wildcard origins are rejected and
  production rejects localhost origins. CORS enables credentials only for that
  allowlist, never for `*`.
- Gateway emits `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a
  restrictive referrer policy, API CSP, permissions policy and production
  HSTS. JSON and URL-encoded bodies have an explicit bounded limit and safe
  `REQUEST_BODY_TOO_LARGE` response.
- Real accounts use Argon2id (`19 MiB`, time cost `2`, parallelism `1`), with
  a 15--128 Unicode-character password policy. Passwords, access tokens,
  refresh tokens and reset tokens are never logged or persisted in plaintext.
- Access tokens are JWTs created and verified by `jsonwebtoken`, constrained
  to HS256, signature, issuer, audience, expiry, token type and required
  `iss`, `aud`, `sub`, `sid`, `role`, `iat`, `exp` and `jti` claims. The Web
  holds the access token in JavaScript memory only, never in localStorage,
  sessionStorage or a cookie.
- Refresh tokens are opaque random values. Only their SHA-256 hashes persist
  in Core's `user_sessions`; the raw value is issued only as an HttpOnly,
  SameSite=Lax cookie scoped to `/api/v1/auth` and marked Secure outside local
  HTTP development. Refresh rotates the token generation transactionally. A
  replay revokes every generation in that token family and is audited.
- Registration commits `users`, `user_credentials`, and the initial refresh
  session in one Core PostgreSQL transaction. Password reset tokens are
  one-time, expiring, hash-only rows; reset and password change revoke all
  user sessions. Session listing/revocation is actor scoped.
- Login intentionally makes unknown-user and wrong-password results
  indistinguishable. Demo tokens remain a development/test compatibility mode
  only; production environment validation rejects enabling them.
- The Gateway applies bounded process-local profiles to login, registration,
  password reset/refresh and assistant routes. A shared/distributed limiter is
  still required before a multi-instance production deployment; this phase
  deliberately does not add Redis or queue infrastructure.

## Product/Ops and local acceptance hardening

- Notifications, favorites, feedback and support endpoints are actor scoped;
  resource-linked writes are checked through the owning domain client. Admin
  routes use a server-side role guard, so a normal user cannot rely on a
  frontend role check to reach operational data.
- Product final actions retain the two explicit confirmations and domain-owned
  idempotency. Admin support update replays are keyed by actor/operation/key
  and request hash; a changed payload is rejected and a same-payload replay
  does not repeat the audit effect.
- The local deterministic geocode fallback is rejected in production, and the
  Ride tracking time scale is constrained to `1.0` in production. Local
  accelerated tracking and synthetic drivers are test/demo controls only.
- Live browser listeners treated page errors, `console.error`, and failed
  non-aborted requests as acceptance failures. The verified local transaction
  flow produced no unexplained browser errors; no secret, raw prompt or token
  was printed.

## Cookie-origin and CSRF policy

Cookie-authenticated refresh/logout operations require an `Origin` in the
configured exact allowlist, or an allowed `Referer` origin fallback when no
Origin exists. Missing, malformed or foreign origin evidence returns a safe
403. CORS is not treated as CSRF protection. The same origin check is applied
to bearer-authenticated operations that clear or revoke a browser refresh
cookie (`logout-all`, session revocation and password change). `SameSite=Lax`
adds browser-level cross-site protection while retaining same-site Web-to-
Gateway development on the documented origins.

## Reset delivery and audit policy

The current reset-delivery seam does not claim to send email. It returns the
same accepted response for known and unknown accounts. The
`AUTH_DEV_RESET_TOKEN_CAPTURE=true` escape hatch is valid only in development
or test and exists for deterministic tests/local debugging; production
configuration rejects it, the Web does not render it, and it must not be used
as a production delivery channel.

Core audit events record a bounded action, actor, correlation ID and safe
resource metadata for registration, login success/failure, refresh-reuse
detection, logout, session revocation, password change and reset activity.
They omit raw credentials, raw tokens, provider secrets, raw prompts and
chain-of-thought. The Agent accepts untrusted content only as validated typed
tool requests; it cannot authenticate a user, call a domain database or make a
side effect.
