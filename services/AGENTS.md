# Domain Service Instructions

Food, Ride, Restaurant, and Healthcare inherit these rules. Keep the dependency direction `API → application → domain ← repository interface`, with infrastructure/persistence implementing the repository edge; do not create abstractions not needed by the current skeleton.

Routes are thin. Use Pydantic request/response schemas, correct OpenAPI, safe error envelopes, ISO-8601 time, integer money, internal authentication, and idempotent writes. SQLAlchemy/Alembic changes stay within the owning service; seeds are deterministic. Liveness reports process health; readiness may report validated configuration but must not claim a database probe that is not implemented.

Never import another service's business code/database, depend on Gemini, or add a scoped `AGENTS.md` unless a real service-specific rule is needed.
