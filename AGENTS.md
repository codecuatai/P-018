# X-One Agent Instructions

## Purpose and precedence

These rules apply repository-wide. User instructions override this file; the nearest scoped `AGENTS.md` adds constraints but cannot weaken these invariants. `AGENTS.md` guides coding agents, while [CONTRIBUTING.md](CONTRIBUTING.md) guides human contributors. `.agents/` contains tool-specific workflows such as AI logging only.

## Required reading

Read `README.md`, `docs/README.md`, `docs/architecture/system-overview.md`, `docs/architecture/service-boundaries.md`, `docs/architecture/data-architecture.md`, and `docs/api/api-conventions.md` before backend work. For a new service, also read `docs/development/new-service-checklist.md`; for a human workflow, use `CONTRIBUTING.md`.

Before changing a file, run `git status --short` and read this file plus the nearest applicable scoped `AGENTS.md`. Inspect the filesystem rather than relying on generated repository summaries; `repomix-output.xml`, when present, is only an index.

## Architecture and repository boundaries

- Web/mobile call only the NestJS gateway. Gateway owns workflows, confirmations, tool execution, audit/idempotency, and payment sandbox.
- Agent emits typed tool requests only. It never calls a domain service/database, executes side effects, publishes analysis/chain-of-thought, or decides transaction success.
- A domain service owns its domain and one logical database. No cross-database query, cross-service foreign key, shared ORM model, or business-logic import is allowed.
- Restaurant owns dine-in table reservations; Food owns menus, food orders, and delivery ordering. Do not overlap them.
- REST/JSON/OpenAPI is the internal contract. Do not put shared business logic in `packages/`: contracts, generated clients, and small reference configuration are its only roles.
- Booking requires two explicit user confirmations: first confirm the selected service and booking details, then confirm payment. The agent cannot create a booking, charge payment, or decide either outcome.
- Writes are idempotent. Update contracts, clients, tests, and docs with API changes.

## Database, environment, and secrets

- A schema change needs an owned migration and data-architecture update; seeds are deterministic and owned by the service.
- Root `.env.example` is the local Compose source of truth. Compose maps least-privilege variables explicitly; never use a shared `env_file`.
- Inside a container, use Docker service DNS names, never `localhost`, for another container. Loopback is allowed only in a standalone/local example or a container's own health check.
- Service config reads process environment only. Update root example, Compose mapping, validation, docs, and a standalone example together.
- Never commit/read/print `.env`, secrets, raw prompts, or chain-of-thought. Do not hard-code credentials or service URLs.

## Quality, documentation, and change discipline

- TypeScript is strict; Python uses type hints, Pydantic validation, safe errors, and no bare `except`.
- Run applicable lint/type checks/tests/build plus `python scripts/validate-env-config.py` and `docker compose --env-file .env.example config --quiet`.
- A schema change needs an owned migration, then any deterministic seed, tests, and a data-architecture update. An API change needs its OpenAPI/tool contract, generated client where applicable, compatibility tests, and API documentation.
- Keep implementation status honest. `implemented` needs observable source/configuration and a cited check; `skeleton` has only boundary/scaffolding; `planned` has no runnable/wired implementation. Do not turn a roadmap into a completed feature.
- Update docs in the same patch for boundary, API, database, port, workflow, tool, or environment changes.
- Preserve user changes and binary assets. Do not delete a file unless references/build/test use have been checked and it is demonstrably disposable; prefer `.gitignore` for reproducible artifacts. Check `git status --short` again after changes. Do not commit/push, delete PostgreSQL volumes, add queues/Kubernetes/Redis/multi-agent infrastructure, or add unused abstractions.
