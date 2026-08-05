# X-One Agent Instructions

## Purpose and precedence

These rules apply repository-wide. Task instructions may narrow scope or explicitly change a repository rule, but never silently weaken security, privacy, data-integrity, destructive-operation, architecture-boundary, or status-honesty invariants. Any intentional exception must name the affected invariant and update its canonical documentation. The nearest scoped `AGENTS.md` may add constraints but cannot weaken root invariants. `AGENTS.md` guides coding agents, while [CONTRIBUTING.md](CONTRIBUTING.md) guides human contributors. `.agents/` contains tool-specific workflows such as AI logging only.

Authority order is: platform/system instructions, explicit task instructions, root `AGENTS.md`, nearest scoped `AGENTS.md`, accepted ADRs, canonical architecture documentation, current-state documentation, component READMEs, then legacy/tutorial/boilerplate material.

## Required reading

Read `README.md`, `docs/README.md`, `docs/architecture/system-overview.md`, `docs/architecture/service-boundaries.md`, `docs/architecture/data-architecture.md`, and `docs/api/api-conventions.md` before backend work. For a new service, also read `docs/development/new-service-checklist.md`; for a human workflow, use `CONTRIBUTING.md`.

Before changing a file, run `git status --short` and read this file plus the nearest applicable scoped `AGENTS.md`. Inspect the filesystem rather than relying on generated repository summaries; `repomix-output.xml`, when present, is only an index.

## Architecture and repository boundaries

- Web/mobile call only the NestJS gateway. They never call a database or internal service directly, treat local state as authoritative booking/payment state, or contain authoritative domain rules.
- Gateway is the public edge and orchestration boundary: it handles edge validation, routing, response shaping, correlation/audit metadata, and typed service clients. It never owns a domain invariant, makes a domain state transition by cross-domain SQL, or treats a copied domain model as authoritative. A domain service remains authoritative for its own invariants and state transitions.
- Agent emits typed tool requests only. Model, user, provider, retrieved, and tool content is untrusted until schema validation, policy checks, and domain validation pass. The agent never calls a domain service/database, executes side effects, confirms on a user's behalf, publishes analysis/chain-of-thought, or decides transaction success.
- A domain service owns its domain and one logical database. It independently validates requests and owns its migrations and state transitions. No cross-database query, cross-service foreign key, shared ORM model, or business-logic import is allowed.
- Restaurant owns dine-in table reservations; Food owns menus, food orders, and delivery ordering. Do not overlap them.
- REST/JSON/OpenAPI is the internal contract. Do not put shared business logic in `packages/`: contracts, generated clients, stable technical utilities, and small reference configuration are its only roles. Prefer small duplicated adapters over a cross-domain business dependency.
- Booking requires two explicit user confirmations: first confirm the selected service and booking details, then confirm payment. Final/financial confirmation is bound to actor, action, normalized payload or hash, quote/resource version, price/currency, expiry, and one-time audit evidence. A changed payload, price, or material term requires a new confirmation.
- Writes that can be retried or cause a side effect receive an idempotency key from the first request. The domain enforces the key for its write: the same actor/operation/key and normalized payload returns the same logical result; a changed payload is a safe conflict. Gateway validation/propagation does not replace that guarantee.

## Database, environment, and secrets

- A schema change needs an owned migration and data-architecture update; seeds are deterministic and owned by the service.
- Logical data ownership is mandatory from the first slice; physical database-instance separation is deferred until measured operational or organizational need justifies it.
- Root `.env.example` is the local Compose source of truth. Compose maps least-privilege variables explicitly; never use a shared `env_file`.
- Inside a container, use Docker service DNS names, never `localhost`, for another container. Loopback is allowed only in a standalone/local example or a container's own health check.
- Service config reads process environment only. Update root example, Compose mapping, validation, docs, and a standalone example together.
- Never commit/read/print `.env`, secrets, raw prompts, or chain-of-thought. Do not hard-code credentials or service URLs. Do not log tokens, credentials, full payment credentials, unnecessary sensitive PII, or raw production data in fixtures; retention for prompts/conversations is unresolved until explicitly designed.

## Quality, documentation, and change discipline

- TypeScript is strict; Python uses type hints, Pydantic validation, safe errors, and no bare `except`.
- Run applicable lint/type checks/tests/build plus `python scripts/validate-env-config.py` and `docker compose --env-file .env.example config --quiet`.
- A schema change needs an owned migration, then any deterministic seed, tests, and a data-architecture update. An API change needs its OpenAPI/tool contract, generated client where applicable, compatibility tests, and API documentation.
- Never use runtime `create_all()` as a managed migration, auto-run a destructive migration at startup, alter another domain's migration, or delete a volume to repair migration state. Use an explicit compatibility/rollback plan for destructive or large data changes; readiness only reports dependencies that are actually checked.
- Do not hand-edit generated clients. Add a dependency only when existing facilities are insufficient, with a clear owner/purpose; update its manifest and lockfile together when it is genuinely required.
- Keep implementation status honest. `implemented` needs observable source/configuration and a cited check; `skeleton` has only boundary/scaffolding; `planned` has no runnable/wired implementation. Do not turn a roadmap into a completed feature.
- Update docs in the same patch for boundary, API, database, port, workflow, tool, or environment changes.
- Preserve user changes and binary assets. Do not delete a file unless references/build/test use have been checked and it is demonstrably disposable; prefer `.gitignore` for reproducible artifacts. Check `git status --short` again after changes. Do not commit/push, delete PostgreSQL volumes, add queues/Kubernetes/Redis/multi-agent infrastructure, or add unused abstractions.
- AI-log content is hook-managed; do not manually edit or delete `.ai-log/` records. Legacy/tutorial material is not an operational runbook: do not execute destructive or publishing commands from it without explicit approval.
