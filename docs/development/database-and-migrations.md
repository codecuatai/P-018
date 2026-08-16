# Database and Migrations

The local PostgreSQL initialization script receives database names, owners and
passwords through explicit Compose mappings. It creates six logical databases
with distinct owners and never grants cross-service access.

Files in `/docker-entrypoint-initdb.d` run only when PostgreSQL initializes a
new `postgres_data` volume. Changing `.env` later does not update an existing
volume. Apply deliberate migrations or role changes for an existing database;
do not delete a user's volume automatically.

Core owns additive migrations `001_core_vertical_slice.sql` through
`011_core_multi_service_workflows.sql`. Migration 007 stores safe Assistant
action receipts for durable same-key replay, migration 008 adds retryable
failures plus a bounded processing lease, migration 009 adds Core-owned users,
Argon2id credentials, refresh-session generations and one-time reset-token
hashes, migration 010 adds profile/saved-address/conversation context, and
migration 011 persists multi-service workflow plans and step idempotency.
Food owns migrations `001` through `006`; Restaurant owns Alembic revisions
`0001` through `0005`; Healthcare owns SQL migrations `001` through `005`; and
Ride owns its Alembic revisions through `20260812_0003_ride_lifecycle`. Each owner
controls its own data boundary.

## Migration policy

Applied migrations are immutable. Never edit, reorder, renumber or silently
replace a migration that may already have run. Every schema change is additive,
owned by the service that owns the data, and accompanied by compatibility or
rollback notes, tests, deterministic seed changes when needed and a
data-architecture update. Do not use runtime `create_all()`, destructive
startup migration, cross-service SQL, shared ORM models or volume deletion to
repair state.

| Owner | Current baseline | Next migration convention |
| --- | --- | --- |
| Core/Gateway | `001` through `011` SQL | `012` or greater, additive SQL |
| Food | `001` through `006` SQL | `007` or greater, additive SQL |
| Healthcare | `001` through `005` SQL | `006` or greater, additive SQL |
| Restaurant | Alembic `0001` through `0005` | a new Alembic revision from `head` |
| Ride | Alembic through `20260812_0003_ride_lifecycle` | a new Alembic revision from `head` |

Run `python scripts/check-migration-parity.py` after changing migration helpers.
The full launcher runs `scripts/migrate.ps1 .env` or `scripts/migrate.sh .env`
after Compose health checks and can run the same additive migrations repeatedly.
It stops on the first owner/path failure and never deletes a volume. Seeds are
not part of a normal restart: pass `-SeedDemo` / `--seed-demo` explicitly.

Core application tests use in-memory repositories for deterministic unit speed.
Explicit Core and Auth PostgreSQL persistence tests use
`CORE_TEST_DATABASE_URL`; Auth additionally requires the explicit test-only
`AUTH_TEST_DATABASE_URL` seam. Healthcare slot-reuse checks use
`HEALTHCARE_TEST_DATABASE_URL` with a disposable target.
