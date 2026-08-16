# Shared Configuration

**This directory contains only this README** — no shared configuration code is checked in yet.

Scope, when something does land here: small non-business, cross-cutting reference values only — currency codes, timezone, service-type enums, common error codes. Each service keeps ownership of its own environment parsing and fail-fast validation.

Explicitly out of scope, per root `AGENTS.md`:

- ORM models or any database access
- Business logic or domain rules
- Secrets, credentials, or service URLs

Status: `planned`. See [current architecture state](../../docs/architecture/current-state.md).
