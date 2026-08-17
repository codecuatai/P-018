-- Upgrade the legacy develop catalog in place before the provenance migration.
-- The legacy schema used healthcare_facilities.id/facility_id references; keep
-- those columns and backfill the current source-id relationships.
BEGIN;

DO $$
BEGIN
  -- Fresh databases have no legacy facility table. Leave the current 004
  -- migration responsible for creating the canonical catalog schema.
  IF to_regclass('healthcare_facilities') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE healthcare_facilities ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP;
  ALTER TABLE healthcare_facilities ADD COLUMN IF NOT EXISTS dataset_version VARCHAR(120);
  ALTER TABLE healthcare_facilities ADD COLUMN IF NOT EXISTS content_hash CHAR(64);
  ALTER TABLE healthcare_facilities ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE healthcare_facilities ADD COLUMN IF NOT EXISTS provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb;

  IF to_regclass('departments') IS NOT NULL THEN
    ALTER TABLE departments ADD COLUMN IF NOT EXISTS facility_source_id VARCHAR(255);
    ALTER TABLE departments ADD COLUMN IF NOT EXISTS source_name VARCHAR(120);
    ALTER TABLE departments ADD COLUMN IF NOT EXISTS source_url VARCHAR(800);
    ALTER TABLE departments ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMP;
    ALTER TABLE departments ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP;
    ALTER TABLE departments ADD COLUMN IF NOT EXISTS dataset_version VARCHAR(120);
    ALTER TABLE departments ADD COLUMN IF NOT EXISTS content_hash CHAR(64);
    ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE departments ADD COLUMN IF NOT EXISTS provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'departments'
        AND column_name = 'facility_id'
    ) THEN
      UPDATE departments AS department
      SET facility_source_id = facility.source_id
      FROM healthcare_facilities AS facility
      WHERE department.facility_source_id IS NULL
        AND department.facility_id = facility.id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'departments'
        AND column_name = 'source_id'
    ) AND EXISTS (
      SELECT 1
      FROM departments
      WHERE source_id IS NOT NULL
      GROUP BY source_id
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'Healthcare legacy upgrade found duplicate department source_id values; resolve them before applying catalog provenance';
    END IF;
  END IF;

  IF to_regclass('doctors') IS NOT NULL THEN
    ALTER TABLE doctors ADD COLUMN IF NOT EXISTS facility_source_id VARCHAR(255);
    ALTER TABLE doctors ADD COLUMN IF NOT EXISTS source_name VARCHAR(120);
    ALTER TABLE doctors ADD COLUMN IF NOT EXISTS source_url VARCHAR(800);
    ALTER TABLE doctors ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMP;
    ALTER TABLE doctors ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP;
    ALTER TABLE doctors ADD COLUMN IF NOT EXISTS dataset_version VARCHAR(120);
    ALTER TABLE doctors ADD COLUMN IF NOT EXISTS content_hash CHAR(64);
    ALTER TABLE doctors ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE doctors ADD COLUMN IF NOT EXISTS provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'doctors'
        AND column_name = 'facility_id'
    ) THEN
      UPDATE doctors AS doctor
      SET facility_source_id = facility.source_id
      FROM healthcare_facilities AS facility
      WHERE doctor.facility_source_id IS NULL
        AND doctor.facility_id = facility.id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'doctors'
        AND column_name = 'source_id'
    ) AND EXISTS (
      SELECT 1
      FROM doctors
      WHERE source_id IS NOT NULL
      GROUP BY source_id
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'Healthcare legacy upgrade found duplicate doctor source_id values; resolve them before applying catalog provenance';
    END IF;
  END IF;
END $$;

COMMIT;
