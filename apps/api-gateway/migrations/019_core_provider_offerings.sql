BEGIN;

-- Expand provider_profiles with business branding, contact, and webhook capabilities
ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true;

-- Items and services attached by providers (dishes, vehicles, healthcare specialties)
CREATE TABLE IF NOT EXISTS provider_service_items (
  id UUID PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL CHECK (domain IN ('ride', 'food', 'restaurant', 'healthcare')),
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'VND',
  category TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_service_items_provider_idx
  ON provider_service_items(provider_id, domain);

COMMIT;
