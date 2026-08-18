# Contributing to X-One

Start with [local development](docs/development/local-development.md), create a scoped branch, and keep each change focused. Before review, run the documented environment validator, Compose config validation, relevant lint/tests/build, and update docs in the same patch.

API changes require OpenAPI/tool contracts, typed clients, tests, and API documentation. Database changes require an owned migration, deterministic seed plan when applicable, and data-architecture update. Do not commit secrets, access another service database, bypass hooks, or represent a skeleton as a completed business feature.

Reviewers check service boundaries, idempotency/confirmation on writes, safe errors, least-privilege environment mappings, migration ownership, test evidence, and documentation synchronization.
