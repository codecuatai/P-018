# Migrations

Healthcare owns these ordered raw-SQL migrations and applies them only to `xone_healthcare`. They are additive; an already-applied file is never edited.

| File | What it does |
| --- | --- |
| `001_healthcare_booking.sql` | Creates the first Healthcare-owned schema: `departments`, `doctors`, `patients`, `time_slots` (`AVAILABLE`/`HOLDING`/`BOOKED` with `hold_expires_at`), `appointments` (`DRAFT`/`CONFIRMED`/`CANCELLED`, actor-scoped), `audit_logs`, and `idempotency_records` |
| `002_healthcare_slot_reuse.sql` | Replaces the global appointment-slot uniqueness constraint with a partial unique index covering only active appointments, so cancelled/expired history is preserved and a freed slot can be rebooked |
| `003_healthcare_provider_catalog.sql` | Adds the `healthcare_facilities` table and `source_id`/`facility_id` on `departments` and `doctors`; replaces global `departments.name` uniqueness with per-facility partial unique indexes; adds `title`, `specialty`, `image_url`, `source_url` to `doctors`; drops `NOT NULL` from `doctors.price` so a CSV-imported doctor with no source consultation price stays discoverable but cannot be held until priced |

Apply all three explicitly with `scripts/migrate.ps1` or `scripts/migrate.sh` before running the deterministic seed. Application startup never creates or alters the schema.

A new migration must be registered in **both** runners; `python scripts/check-migration-parity.py` detects drift between them.
