-- Food-owned catalog import metadata. Additive: the JSON payload remains the
-- runtime contract while this table makes source/version state queryable.
BEGIN;

CREATE TABLE IF NOT EXISTS catalog_dataset_versions (
  dataset_version TEXT PRIMARY KEY,
  domain TEXT NOT NULL CHECK (domain = 'food'),
  content_hash CHAR(64) NOT NULL,
  source_manifest JSONB NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL CHECK (status IN ('VALIDATED', 'IMPORTED', 'PARTIAL', 'DEACTIVATED'))
);

ALTER TABLE food_catalog ADD COLUMN IF NOT EXISTS dataset_version TEXT;
ALTER TABLE food_catalog ADD COLUMN IF NOT EXISTS source_record_id TEXT;
ALTER TABLE food_catalog ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE food_catalog ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE food_catalog ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;
ALTER TABLE food_catalog ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
ALTER TABLE food_catalog ADD COLUMN IF NOT EXISTS content_hash CHAR(64);
ALTER TABLE food_catalog ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS food_catalog_source_record_idx ON food_catalog (record_type, source_record_id) WHERE source_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS food_catalog_dataset_version_idx ON food_catalog(dataset_version);
CREATE INDEX IF NOT EXISTS food_catalog_active_idx ON food_catalog(record_type, is_active);

COMMIT;
