# Domain Service Instructions

Food, Ride, Restaurant, and Healthcare inherit these rules. Keep the dependency direction `API → application → domain ← repository interface`, with infrastructure/persistence implementing the repository edge; do not create abstractions not needed by the current skeleton.

Routes are thin. Use Pydantic request/response schemas, correct OpenAPI, safe error envelopes, ISO-8601 time, integer money, internal authentication, and idempotent writes. Independently validate requests from the gateway/agent and remain authoritative for domain invariants and state transitions. SQLAlchemy/Alembic changes stay within the owning service; never use runtime `create_all()` as a managed migration, auto-run destructive migration, or alter another owner's migration. Seeds are deterministic. Liveness reports process health; readiness may report validated configuration but must not claim a dependency probe that is not implemented.

Never import another service's business code/database, depend on Gemini, or add a scoped `AGENTS.md` unless a real service-specific rule is needed.
