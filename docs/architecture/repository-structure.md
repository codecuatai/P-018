# Repository Structure

`apps/` contains user-facing applications and central orchestration: gateway, agent, web, and mobile. `services/` contains independently owned domain services. `packages/` contains versioned contracts, generated TypeScript clients, and non-business shared configuration; generated clients are regenerated from contracts and must not be hand-edited.

`tests/` holds cross-service contract/integration/E2E/evaluation suites; unit tests stay with their owner. `infra/` holds local runtime bootstrap only. `scripts/` holds reproducible developer/CI helpers. Root documentation defines the architecture; service-specific run instructions live in `services/README.md`.

```text
apps/          gateway, agent, web, mobile
services/      ride, restaurant, healthcare, food
packages/      contracts, generated clients, shared config
tests/         cross-service tests and agent evaluations
infra/         PostgreSQL initialization
scripts/       setup, validation, migration, seed, test helpers
docs/          architecture, API, ADR, development guidance
```

Ownership follows directory boundaries. Do not hand-edit generated clients, build output, lockfile internals, or AI log content. To add an app/service, use [the checklist](../development/new-service-checklist.md): create its owner directory and config, add runtime/database/gateway/contract/tests/docs in one coherent change.
