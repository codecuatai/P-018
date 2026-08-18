# Domain Services

Each domain service owns one bounded domain and logical database. The common layout is `api` → `application` → `domain`, with repository interfaces/adapters at the persistence edge. Read [AGENTS.md](AGENTS.md) before editing.

Run a service independently by providing its process environment from its `.env.example` as a reference, then run its FastAPI entry point. For the complete stack, use only root `.env` and Docker Compose.

Run tests from a service directory with `python -m pytest tests -q`. Add an Alembic revision in that service's `migrations/` directory with every schema change and deterministic fixtures in `seeds/` when needed.

To add a service, follow [the new-service checklist](../docs/development/new-service-checklist.md): create the service skeleton, environment/Compose/database ownership, gateway client, contracts, tests/CI/scripts, and architecture documentation together.
