# Migrations

`001_healthcare_booking.sql` creates the first Healthcare-owned schema and
`002_healthcare_slot_reuse.sql` replaces the global appointment-slot uniqueness
constraint with a partial unique index for active appointments. `003_patient_user_links.sql`
adds the Healthcare-owned actor-to-medical-patient relationship. `004_healthcare_catalog_provenance.sql`
adds facilities, source metadata, and dataset versions. `005_healthcare_catalog_nullable_price.sql`
preserves missing source consultation prices as NULL; the booking route refuses a slot
without an authoritative price instead of manufacturing a zero price. Apply the migrations explicitly
with `scripts/migrate.ps1` or `scripts/migrate.sh` before running the deterministic seed.
Application startup never creates or alters the schema. Use `scripts/import_healthcare_dataset.py --dataset-version <version> --apply` explicitly. The specialty CSV is parsed into a controlled staging projection because its tags/description fields contain unquoted commas; the raw source remains unchanged and rows without a source URL are retained with a quality flag.
