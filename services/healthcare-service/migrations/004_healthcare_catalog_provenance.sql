-- Healthcare-owned facility/catalog provenance. Patient identity links are
-- owned by the additive 003_patient_user_links.sql migration.
BEGIN;

CREATE TABLE IF NOT EXISTS catalog_dataset_versions (
  dataset_version TEXT PRIMARY KEY,
  domain TEXT NOT NULL CHECK (domain = 'healthcare'),
  content_hash CHAR(64) NOT NULL,
  source_manifest JSONB NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(16) NOT NULL CHECK (status IN ('VALIDATED', 'IMPORTED', 'PARTIAL', 'DEACTIVATED'))
);

CREATE TABLE IF NOT EXISTS healthcare_facilities (
  source_id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, facility_type VARCHAR(120), address TEXT NOT NULL,
  ward VARCHAR(120), district VARCHAR(120), city VARCHAR(120), latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
  phone VARCHAR(64), website VARCHAR(800), description TEXT, emergency_available BOOLEAN, opening_hours TEXT, image_url VARCHAR(800),
  source_name VARCHAR(120), source_url VARCHAR(800), fetched_at TIMESTAMP, last_verified_at TIMESTAMP, dataset_version VARCHAR(120), content_hash CHAR(64),
  is_active BOOLEAN NOT NULL DEFAULT TRUE, provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90), CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

ALTER TABLE departments ADD COLUMN IF NOT EXISTS source_id VARCHAR(255);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS facility_source_id VARCHAR(255);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS source_name VARCHAR(120);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS source_url VARCHAR(800);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMP;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS dataset_version VARCHAR(120);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS content_hash CHAR(64);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS source_id VARCHAR(255);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS facility_source_id VARCHAR(255);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS specialty TEXT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS source_name VARCHAR(120);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS source_url VARCHAR(800);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMP;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS dataset_version VARCHAR(120);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS content_hash CHAR(64);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_source_id ON departments(source_id) WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_doctors_source_id ON doctors(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_healthcare_facilities_active ON healthcare_facilities(is_active);

COMMIT;
