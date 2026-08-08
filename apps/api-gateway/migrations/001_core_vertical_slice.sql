BEGIN;
CREATE TABLE IF NOT EXISTS confirmations (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL, quote_version TEXT NOT NULL, amount INTEGER NOT NULL, currency CHAR(3) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, order_id TEXT NOT NULL, amount INTEGER NOT NULL, currency CHAR(3) NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('bank_transfer', 'card', 'e_wallet')), status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL, receipt_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (actor_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY, action TEXT NOT NULL, actor_id TEXT, resource_id TEXT, correlation_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS confirmations_actor_idx ON confirmations(actor_id);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments(order_id);
COMMIT;
