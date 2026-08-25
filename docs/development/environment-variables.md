# Environment Variables

Root `.env.example` is the local Docker Compose source of truth. It groups shared settings, PostgreSQL admin and logical-database credentials, per-service database URLs, ports/internal URLs, Gateway security settings, Gemini configuration, and optional Langfuse configuration. It contains placeholders only. The checked-in template selects `AGENT_MODEL_MODE=gemini`, but its blank `GEMINI_API_KEY` keeps normal local development on the deterministic fallback; a private valid key enables the real-LLM path.

`AGENT_PERSISTENCE_MODE` is `required_postgres` in Compose. In that mode the
Agent readiness probe requires the explicitly migrated `agent_run_metadata`
table and never falls back to process memory. The standalone Agent example uses
`memory` explicitly for local/test execution only.

Compose automatically reads root `.env` for `${VARIABLE}` interpolation but does not pass that full file to containers. PostgreSQL receives only bootstrap/database variables; Gateway receives Core database, internal URLs, token, explicit `APP_ENV`, CORS allowlist, body limit, rate-limit profiles, real-auth settings and development/test-only demo-auth configuration; Agent receives agent database, Gemini values, the three Langfuse values, CORS, and token; Healthcare receives its database/token plus its domain-owned `HEALTHCARE_FACILITY_NAME` and `HEALTHCARE_FACILITY_ADDRESS`; Food receives only its database/token plus explicit persistence, delivery, rejection, and timed-workflow settings. The Web image receives only build-time `NEXT_PUBLIC_*` values, never Gemini, Langfuse, or internal tokens. `FOOD_PERSISTENCE` is required and only `postgres` is valid in production; `memory` is an explicit development/test adapter.

Gateway security variables are `GATEWAY_CORS_ORIGINS`, `GATEWAY_BODY_LIMIT_BYTES`, `GATEWAY_RATE_LIMIT_WINDOW_SECONDS`, `GATEWAY_AUTH_LOGIN_RATE_LIMIT`, `GATEWAY_ASSISTANT_CHAT_RATE_LIMIT`, `GATEWAY_ASSISTANT_ACTION_RATE_LIMIT`, and `GATEWAY_FUTURE_AUTH_RATE_LIMIT`. Location integration may use explicit `GEOCODING_PROVIDER_URL` / `GEOCODING_PROVIDER_TOKEN` and `ROUTING_PROVIDER_URL` / `ROUTING_PROVIDER_TOKEN`; the legacy `LOCATION_PROVIDER_URL` / `LOCATION_PROVIDER_TOKEN` remains a compatibility fallback. When a provider URL is blank or unavailable, Gateway returns a labeled deterministic geocode/route fallback, never as booking authority. `LOCAL_DETERMINISTIC_LOCATION_FALLBACK=true` is a development-only switch for seeded local/E2E addresses; environment validation rejects it in production. CORS origins are comma-separated explicit HTTP(S) origins; wildcard and production localhost origins fail validation. The current default body limit is 262,144 bytes. Rate limiting is process-local for the current local/single-instance baseline; a multi-instance production deployment must provide a distributed edge/Gateway limiter before relying on these counters.

Real authentication requires `AUTH_ACCESS_TOKEN_TTL_SECONDS`, `AUTH_REFRESH_TOKEN_TTL_SECONDS`, `AUTH_RESET_TOKEN_TTL_SECONDS`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_REFRESH_COOKIE_NAME` and `AUTH_DEV_RESET_TOKEN_CAPTURE`. Production rejects test capture and demo auth. `AUTH_DEV_RESET_TOKEN_CAPTURE=true` is an explicit development/test-only reset-token test seam, never a mail-delivery mechanism. Demo auth remains a sandbox compatibility boundary: it is enabled only when `APP_ENV` is `development` or `test` and `DEMO_AUTH_ENABLED=true`; a signed demo token is rejected in every other environment. When demo auth is enabled, the three demo credential variables are required. In production, set `DEMO_AUTH_ENABLED=false`; demo credentials may be empty or unset.

`WEB_PORT` controls the published Next.js container port. `NEXT_PUBLIC_API_URL` is the browser-visible public Gateway URL; `NEXT_PUBLIC_HERO_VIDEO_URL` and `NEXT_PUBLIC_HERO_POSTER_URL` are optional decorative public asset URLs. Do not put an internal DNS URL, token or secret in any `NEXT_PUBLIC_*` value. `HEALTHCARE_DEFAULT_PATIENT_ID` is required in development/test so the deterministic demo fallback is explicit. It is optional in production; without an authenticated user-to-patient link, Gateway returns `PATIENT_LINK_REQUIRED` instead of silently selecting a patient. Identity/session and the Healthcare-owned patient-link boundary are implemented; the fallback remains development-only.

Production is different: do not upload root `.env` wholesale. The deployment platform supplies each service's individual environment variables and secrets. The same configuration names keep code unchanged.

For a real-Gemini Gate G2 evaluation, set a valid `GEMINI_API_KEY` (or multiple comma-separated keys in `GEMINI_API_KEYS`) in a private root `.env` and set `AGENT_MODEL_MODE=gemini`. When multiple keys are configured in `GEMINI_API_KEYS` (e.g. `key1,key2,key3`), `agent-service` automatically distributes model invocations across keys using a Round Robin pool and provides seamless failover if an individual key encounters quota/rate limits (429). The keys are optional for normal local startup but required for that evaluation path. `GEMINI_API_KEY` and `GEMINI_API_KEYS` are mapped only to `agent-service`; status/health/diagnostics may report only whether keys are configured and the count of active keys, never their secret values.

Optional Agent tracing uses exactly `LANGFUSE_SECRET_KEY`,
`LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_BASE_URL`. Two blank keys keep the
no-op adapter; a complete pair enables private metadata-only traces. A partial
pair fails Agent configuration validation, and the base URL must be a
credential-free HTTPS URL. The values are mapped only to `agent-service`.
There is no configuration that enables raw prompt, message, response, graph
state, authoritative result, actor/session identity, or chain-of-thought
capture.

## QA Trello evidence upload

`TRELLO_API_KEY` and `TRELLO_API_TOKEN` are optional host-only credentials for
the narrowly scoped `scripts/trello-upload.ps1` helper. They are never mapped
into Compose, an application container, or browser-visible configuration. The
helper accepts only a card ID and a repository-local evidence file path, tests
the credentials internally, uploads one attachment, verifies that attachment
is present on that card, and writes only safe attachment metadata. Do not run
the helper with a secret command-line argument or use the credentials from any
other script.

After rebuilding and starting `agent-service`, submit a synthetic,
metadata-only verification trace with:

```bash
docker compose exec agent-service python -m src.observability.smoke
```

The command prints only a safe correlation ID for dashboard lookup. It never
prints credentials or the exported trace payload.

Never commit/share `.env`, put live secrets in examples, pass database credentials across service boundaries, or expose Gemini/internal credentials to a browser client. If a credential was ever committed or copied into a template, revoke/rotate it outside the repository before relying on the replacement placeholder.
