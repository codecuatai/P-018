# Environment Variables

Root `.env.example` is the local Docker Compose source of truth. It groups shared settings, PostgreSQL admin and logical-database credentials, per-service database URLs, ports/internal URLs, and Gemini configuration. It contains placeholders only.

Compose automatically reads root `.env` for `${VARIABLE}` interpolation but does not pass that full file to containers. PostgreSQL receives only bootstrap/database variables; gateway receives core database, internal URLs, token, reconciliation-worker controls, and `CONFIRMATION_PROCESSING_TIMEOUT_SECONDS`/`CONFIRMATION_RECOVERY_POLL_INTERVAL_MS`; agent receives agent database, Gemini values, CORS, and token; Food receives only its database/token plus explicit persistence, delivery, rejection, and timed-workflow settings. Frontend receives neither Gemini nor internal token.

Production is different: do not upload root `.env` wholesale. The deployment platform supplies each service's individual environment variables and secrets. The same configuration names keep code unchanged.

Never commit/share `.env`, put live secrets in examples, pass database credentials across service boundaries, or expose Gemini/internal credentials to a browser client.
