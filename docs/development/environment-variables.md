# Environment Variables

Root `.env.example` is the local Docker Compose source of truth. It groups shared settings, PostgreSQL admin and logical-database credentials, per-service database URLs, ports/internal URLs, and Gemini configuration. It contains placeholders only. `AGENT_MODEL_MODE` defaults to `gemini` for the demo; set it to `deterministic` explicitly for offline tests.

Compose automatically reads root `.env` for `${VARIABLE}` interpolation but does not pass that full file to containers. PostgreSQL receives only bootstrap/database variables; gateway receives core database, internal URLs, token, explicit `APP_ENV`, the explicit `GATEWAY_CORS_ORIGINS` browser-origin allowlist, and development/test-only demo-auth configuration; agent receives agent database, Gemini values, CORS, and token; Healthcare receives its database/token plus its domain-owned `HEALTHCARE_FACILITY_NAME` and `HEALTHCARE_FACILITY_ADDRESS`; Food receives only its database/token plus explicit persistence, delivery, rejection, and timed-workflow settings. Frontend receives neither Gemini nor internal token. `FOOD_PERSISTENCE` is required and only `postgres` is valid in production; `memory` is an explicit development/test adapter.

Demo auth is a sandbox boundary, not production authentication. `DEMO_AUTH_ENABLED=true` requires the three demo credential variables and is rejected when `APP_ENV=production`. Keep values in the non-committed root `.env`.

Production is different: do not upload root `.env` wholesale. The deployment platform supplies each service's individual environment variables and secrets. The same configuration names keep code unchanged.

`GATEWAY_CORS_ORIGINS` is a comma-separated list of exact HTTP(S) origins, without paths or credentials. Wildcards are rejected because the Gateway allows credentialed requests. Production must include each deployed browser origin, for example `https://staging.assistant-018.tech`.

Never commit/share `.env`, put live secrets in examples, pass database credentials across service boundaries, or expose Gemini/internal credentials to a browser client.
