# Migrations

`001_healthcare_booking.sql` creates the first Healthcare-owned schema and
`002_healthcare_slot_reuse.sql` replaces the global appointment-slot uniqueness
constraint with a partial unique index for active appointments. `003_patient_user_links.sql`
adds the Healthcare-owned actor-to-medical-patient relationship. The
`003a_healthcare_legacy_catalog_bridge.sql` compatibility migration upgrades
databases that already applied the old develop catalog migration: it preserves
the legacy integer facility IDs and `facility_id` columns, adds the provenance
columns required by the current schema, and backfills `facility_source_id`.
It is a no-op on fresh databases. `004_healthcare_catalog_provenance.sql`
adds facilities, source metadata, and dataset versions. `005_healthcare_catalog_nullable_price.sql`
preserves missing source consultation prices as NULL; the booking route refuses a slot
without an authoritative price instead of manufacturing a zero price. The canonical
lineage is therefore `001 -> 002 -> 003 -> 003a -> 004 -> 005`, while an old-develop
database enters at the bridge after its legacy `003_healthcare_provider_catalog.sql`.
Apply the migrations explicitly with `scripts/database/migrate.ps1` or `scripts/database/migrate.sh` before
running the deterministic seed.
Application startup never creates or alters the schema. Use `scripts/data/import_healthcare_dataset.py --dataset-version <version> --apply` explicitly. The specialty CSV is parsed into a controlled staging projection because its tags/description fields contain unquoted commas; the raw source remains unchanged and rows without a source URL are retained with a quality flag.
