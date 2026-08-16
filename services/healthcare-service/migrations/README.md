# Migrations

Healthcare owns these ordered raw-SQL migrations and applies them only to `xone_healthcare`. They are additive; an already-applied file is never edited.

| File | What it does |
| --- | --- |
| `001_healthcare_booking.sql` | Creates the first Healthcare-owned schema: `departments`, `doctors`, `patients`, `time_slots` (`AVAILABLE`/`HOLDING`/`BOOKED` with `hold_expires_at`), `appointments` (`DRAFT`/`CONFIRMED`/`CANCELLED`, actor-scoped), `audit_logs`, and `idempotency_records` |
| `002_healthcare_slot_reuse.sql` | Replaces the global appointment-slot uniqueness constraint with a partial unique index covering only active appointments, so cancelled/expired history is preserved and a freed slot can be rebooked |
| `003_patient_user_links.sql` | Adds the Healthcare-owned actor-to-medical-patient relationship |
| `004_healthcare_catalog_provenance.sql` | Adds facilities, source metadata, and dataset versions |
| `005_healthcare_catalog_nullable_price.sql` | Preserves missing source consultation prices as NULL; the booking route refuses a slot without an authoritative price instead of manufacturing a zero price |

Apply all migrations explicitly with `scripts/migrate.ps1` or `scripts/migrate.sh` before running the deterministic seed. Application startup never creates or alters the schema.

A new migration must be registered in **both** runners; `python scripts/check-migration-parity.py` detects drift between them. Use `scripts/import_healthcare_dataset.py --dataset-version <version> --apply` explicitly. The specialty CSV is parsed into a controlled staging projection because its tags/description fields contain unquoted commas; the raw source remains unchanged and rows without a source URL are retained with a quality flag.
