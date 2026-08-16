BEGIN;

-- Phase 2 personal context remains Core-owned. Domain services only receive
-- immutable snapshots of an address when a domain write is requested.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'vi-VN';
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_addresses (
  id TEXT PRIMARY KEY,
  -- AuthUser.sub is a UUID for real accounts and a stable non-UUID in the
  -- explicitly supported development demo-auth seam.
  actor_id TEXT NOT NULL,
  label TEXT NOT NULL,
  address_text TEXT NOT NULL,
  city TEXT,
  district TEXT,
  ward TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  provider TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_addresses_coordinates_pair CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL)),
  CONSTRAINT user_addresses_latitude CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT user_addresses_longitude CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
);
CREATE INDEX IF NOT EXISTS user_addresses_actor_idx ON user_addresses(actor_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS user_addresses_one_default_idx ON user_addresses(actor_id) WHERE is_default;

ALTER TABLE conversation_states ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE conversation_states ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE conversation_states ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE conversation_states ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
ALTER TABLE conversation_states ADD COLUMN IF NOT EXISTS service_context TEXT;
UPDATE conversation_states SET last_message_at=updated_at WHERE last_message_at IS NULL;
CREATE INDEX IF NOT EXISTS conversation_states_actor_updated_idx ON conversation_states(actor_id, updated_at DESC);

COMMIT;
