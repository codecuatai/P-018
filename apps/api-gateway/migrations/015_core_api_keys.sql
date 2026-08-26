BEGIN;

CREATE TABLE IF NOT EXISTS api_key_records (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('gemini','trello','geoapify','google_maps','other')),
  label TEXT NOT NULL,
  last4 TEXT NOT NULL CHECK (length(last4) <= 8),
  key_ciphertext TEXT,
  key_iv TEXT,
  key_auth_tag TEXT,
  last_idempotency_key TEXT,
  last_request_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','expired')),
  environment TEXT NOT NULL DEFAULT 'development',
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_key_records_provider_idx ON api_key_records(provider, status);
CREATE INDEX IF NOT EXISTS api_key_records_status_idx ON api_key_records(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS api_key_records_idempotency_idx ON api_key_records(id, last_idempotency_key);

COMMIT;
