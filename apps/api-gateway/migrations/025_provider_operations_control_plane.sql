BEGIN;

ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS availability_schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS service_areas TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS provider_documents (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  document_url TEXT,
  expires_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_documents_provider_status
  ON provider_documents(provider_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS provider_assignments (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OFFERED' CHECK (status IN ('OFFERED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED')),
  assigned_by TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, domain, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_assignments_queue
  ON provider_assignments(status, due_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_assignments_provider
  ON provider_assignments(provider_id, status, updated_at DESC);

COMMIT;
