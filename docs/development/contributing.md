# Development Contribution Guide

Use root `.env` and Compose for the complete stack. Select a focused branch/scope, read the applicable `AGENTS.md`, and avoid unrelated formatting or generated output. Before review run environment/Compose validation, relevant lint/tests/build, and update docs.

API changes require an OpenAPI/tool contract, typed gateway client where needed, tests, and API docs. Database changes require an owned migration and data documentation. Reviewers reject secrets, cross-service database access, unbounded domain coupling, missing idempotency/confirmation, unsafe errors, and planned work reported as implemented.
