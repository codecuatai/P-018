# X-One Documentation

Start with [the current architecture state](architecture/current-state.md) — it is the canonical, evidence-backed status document, and it overrides any diagram or narrative elsewhere in this tree.

## Architecture

- [Current architecture state](architecture/current-state.md) — canonical evidence-backed status and local runtime facts
- [System overview](architecture/system-overview.md)
- [Repository structure](architecture/repository-structure.md)
- [Service boundaries](architecture/service-boundaries.md)
- [Backend architecture](architecture/backend-architecture.md)
- [Agent architecture](architecture/agent-architecture.md)
- [Workflows](architecture/workflows.md)
- [Food vertical slice](architecture/food-vertical-slice.md) — the reference end-to-end slice
- [Data architecture](architecture/data-architecture.md)
- [Runtime architecture](architecture/runtime-architecture.md)
- [Architecture diagram](architecture_diagram.md)

## API and contracts

- [API conventions](api/api-conventions.md) — envelopes, errors, idempotency, money, time
- [Tool contracts](api/tool-contracts.md) — the typed requests the Agent may emit

## Development

- [Local development](development/local-development.md)
- [Environment variables](development/environment-variables.md)
- [Database and migrations](development/database-and-migrations.md)
- [Testing strategy](development/testing-strategy.md)
- [New-service checklist](development/new-service-checklist.md)
- [Contributing](development/contributing.md)

## Decisions and status

- [ADRs](adr/README.md) — [0001 NestJS central orchestrator](adr/0001-nestjs-central-orchestrator.md), [0002 logical database ownership](adr/0002-logical-database-ownership.md), [0003 synchronous REST](adr/0003-synchronous-rest.md), [0004 one agent tool gateway](adr/0004-one-agent-tool-gateway.md)
- [Project status](project-status.md)
- [UI wireframe flow](ui_wireframe_flow.md) — the Web assistant surface in `apps/web/`

## Plans

Forward-looking, not status:

- [Agent service single-agent plan](plan/agent-service-single-agent-plan.md)
- [Restaurant service improvement plan](plan/restaurant-service-improvement-plan.md)

## Legacy reference

Retained for history or coursework. Neither is authoritative for X-One, and neither is an operational runbook:

- `docs/guide/` — general AI20K course material. Follow root/scoped `AGENTS.md` and [current state](architecture/current-state.md) instead. Do not execute destructive or publishing commands from the guide without explicit approval.
- [AI Concierge project documents](AI_Concierge_Project_Docs/README.md) — planning material for the predecessor product. Its stack (Redis Pub/Sub, WebSockets, pgvector) is not what this repository builds.
