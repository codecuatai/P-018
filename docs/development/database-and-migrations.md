# Database and Migrations

The local PostgreSQL initialization script receives database names, owners, and passwords through explicit Compose environment mappings. It creates six logical databases with distinct owners and never grants cross-service access.

Files in `/docker-entrypoint-initdb.d` run only when PostgreSQL initializes a new `postgres_data` volume. Changing `.env` later does not update an existing volume. Apply deliberate migrations/role changes for an existing database; do not delete a user's volume automatically.

Migration style is per owner, not repository-wide:

| Owner | Style | Location | Current set |
| --- | --- | --- | --- |
| Core (Gateway) | Ordered raw SQL | `apps/api-gateway/migrations/` | `001_core_vertical_slice.sql` … `008_core_assistant_action_recovery.sql` |
| Food | Ordered raw SQL | `services/food-service/migrations/` | `001_food_vertical_slice.sql` … `005_food_idempotency_eligibility.sql` |
| Healthcare | Ordered raw SQL | `services/healthcare-service/migrations/` | `001_healthcare_booking.sql`, `002_healthcare_slot_reuse.sql`, `003_healthcare_provider_catalog.sql` |
| Restaurant | Alembic | `services/restaurant-service/migrations/versions/` | `0001_restaurant_booking.py`, `0002_restaurant_idempotency_records.py`, `0003_restaurant_legacy_idempotency_backfill.py` |
| Ride | Alembic | `services/ride-service/migrations/versions/` | `20260806_0001_ride_simulation.py` |

All migrations are additive; an already-applied file is never edited. Notable revisions:

- Core 007 stores safe Assistant action receipts for durable same-key replay, and 008 adds retryable failures plus a bounded processing lease — neither edits 001–007.
- Restaurant `0002_restaurant_idempotency` adds durable actor/operation/key response snapshots without removing legacy reservation idempotency columns; `0003_restaurant_legacy_backfill` backfills only reconstructable legacy evidence while preserving runtime promotion for surviving create keys.
- Healthcare 002 removes the legacy global `slot_id` uniqueness and adds a partial unique index for active appointments, preserving cancelled/expired history for slot reuse. Healthcare 003 adds the `healthcare_facilities` table plus `source_id`/`facility_id` on `departments` and `doctors`, replaces the global `departments.name` uniqueness with per-facility partial unique indexes, and drops `NOT NULL` from `doctors.price` — which is why a CSV-imported doctor with no source consultation price stays discoverable but cannot be held until priced.

`python scripts/check-migration-parity.py` verifies that `scripts/migrate.ps1` and `scripts/migrate.sh` apply the same file set, so a new migration must be registered in both runners.

The full launcher runs `scripts/migrate.ps1 .env` or `scripts/migrate.sh .env` after Compose health checks and may run the same migrations repeatedly; each owner helper is idempotent. The PowerShell helper checks every individual Core, Food, Healthcare, Restaurant, and Ride migration immediately and stops with the owning domain/path on the first non-zero exit; PostgreSQL SQL is sent as UTF-8 with `ON_ERROR_STOP=1`. Seeds are not part of a normal restart: pass `-SeedDemo`/`--seed-demo` to invoke the deterministic seed helper explicitly. The first argument is an optional env-file path. Neither script deletes volumes. The PowerShell Food seed writes the UTF-8 SQL payload directly to `psql` so the Vietnamese demo catalog is not corrupted by native-pipeline encoding. Food Compose runs against PostgreSQL when `FOOD_PERSISTENCE=postgres`. Core application tests use an in-memory adapter for speed, while explicit PostgreSQL persistence tests are available through `CORE_TEST_DATABASE_URL`; Healthcare slot-reuse checks use `HEALTHCARE_TEST_DATABASE_URL` when a disposable PostgreSQL target is provided.
