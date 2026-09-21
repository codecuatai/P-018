# ADR-0005: Target Authentication and Session Architecture

- Status: Accepted decision for Phase 1; not implemented in Phase 0
- Date: 2026-08-10
- Owners: Core/Gateway

## Context

The current Gateway has a development-only demo login and a short-lived signed token path. It has no user/session tables, refresh-cookie flow, password reset, or production identity provider. Implementing those features during the foundation phase would mix a target decision with the current demo boundary.

## Decision

Phase 1 real authentication will use:

1. Argon2id for password hashing. Plaintext passwords and reversible password encryption are prohibited.
2. Short-lived Bearer access tokens with a target lifetime of approximately 10–15 minutes. Tokens carry issuer, audience, subject, session identifier, issued-at, expiry, and a unique identifier sufficient for validation and revocation policy.
3. Long-lived refresh tokens in an HttpOnly cookie. Only a hash of the refresh token is stored. Refresh is one-time and rotates the token within a token family; reuse detection revokes the family and the affected session.
4. `Secure` on refresh cookies outside local development. `SameSite=Lax` is the default deployment choice; a cross-site deployment must document why `SameSite=None; Secure` is necessary and must use CSRF protection.
5. Cookie-authenticated state changes validate the configured Origin. A same-origin Referer may be accepted as a documented fallback; absent or foreign Origin/Referer is rejected. A CSRF token is required for state-changing cookie-authenticated requests when the deployment topology can receive cross-site requests.
6. Session controls include expiry, revoke current session, revoke all sessions, logout current session, password-change invalidation of existing sessions, and one-time password-reset tokens with bounded expiry and hash-only storage.
7. The demo auth path is available only in `development` and `test`; `APP_ENV=production` with demo auth enabled fails fast.

The Gateway remains the public auth boundary. Domain services do not implement their own user/session database and do not receive browser credentials. Core owns identity/session/confirmation metadata when those Phase 1 tables are introduced.

## Phase 0 boundary

This ADR creates no users, sessions, refresh tokens, cookies, password tables, register endpoint, refresh endpoint, logout endpoint, or reset endpoint. Phase 0 only validates the current demo configuration and locks the target policy.

## Consequences

Phase 1 must add an owned Core migration, password/session tests, an OpenAPI contract, cookie/CSRF integration tests, revocation and reuse tests, and a compatibility plan for the current demo login. Until then, the current Bearer demo token is not production authentication.
