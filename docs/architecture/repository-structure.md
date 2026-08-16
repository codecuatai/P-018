# Repository Structure

`apps/` contains user-facing applications and central orchestration: gateway, agent, web, and mobile. `services/` contains domain-owned boundaries; an entry can be planned, skeletal, in-process, or independently deployable as documented in [current state](current-state.md). `packages/` contains versioned contracts, generated TypeScript clients, and non-business shared configuration; generated clients are regenerated from contracts and must not be hand-edited.

`tests/` holds cross-service suites; unit tests stay with their owner. `infra/` holds local runtime bootstrap only. `scripts/` holds reproducible developer/CI helpers. Root documentation defines the architecture; service-specific run instructions live in `services/README.md`.

```text
apps/          gateway, agent, web, mobile
services/      ride, restaurant, healthcare, food, healthcare-sandbox
packages/      contracts, generated clients, shared config
tests/         cross-service tests and agent evaluations
infra/         PostgreSQL initialization
scripts/       setup, validation, migration, seed, test helpers
docs/          architecture, API, ADR, development guidance
eval/          product-metric report only, no runner
presentation/  demo-day material
.agents/       agent rules and workflows (AI-log hook)
.github/       the single ci-cd.yml workflow
```

Two of those directories are thinner than the layout suggests, and the docs should not imply otherwise:

- Under `tests/`, only `e2e/` contains test code. `integration/`, `contract/`, and `agent-evals/` each hold a README and no tests — the real contract and integration tests live beside their owners under `services/<name>/tests/` and `apps/*/test(s)/`. See [testing strategy](../development/testing-strategy.md).
- Under `packages/`, only `contracts/` is populated. `generated-ts-clients/` and `shared-config/` are README-only placeholders.

`services/healthcare-sandbox/` is a standalone external-provider mock, not a deployed owner: no Dockerfile, no Compose entry, no migrations, no tests, no caller.

Ownership follows directory boundaries. Share only technical capabilities such as contracts, generated clients, stable utilities, logging/tracing conventions, error envelopes, and test utilities; never share a domain ORM model, entity, repository, payment state machine, or unowned "common business logic." Do not hand-edit generated clients, build output, lockfile internals, or AI log content. To add an app/service, use [the checklist](../development/new-service-checklist.md): create its owner directory and config, add runtime/database/gateway/contract/tests/docs in one coherent change.
