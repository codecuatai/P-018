BEGIN;

-- Add connected_services JSONB column to provider_profiles to track per-service connection status
ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS connected_services JSONB NOT NULL DEFAULT '{"ride": true, "food": true, "restaurant": true, "healthcare": true}'::jsonb;

COMMIT;
