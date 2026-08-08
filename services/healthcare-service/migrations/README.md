# Migrations

`001_healthcare_booking.sql` creates the first Healthcare-owned schema and
`002_healthcare_slot_reuse.sql` replaces the global appointment-slot uniqueness
constraint with a partial unique index for active appointments. Apply both explicitly
with `scripts/migrate.ps1` or `scripts/migrate.sh` before running the deterministic seed.
Application startup never creates or alters the schema.
