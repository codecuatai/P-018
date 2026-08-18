BEGIN;

ALTER TABLE confirmations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE confirmations ADD COLUMN IF NOT EXISTS execution_key TEXT;
ALTER TABLE confirmations ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
ALTER TABLE confirmations ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE confirmations ADD COLUMN IF NOT EXISTS failure_code TEXT;
ALTER TABLE confirmations ADD COLUMN IF NOT EXISTS result JSONB;
ALTER TABLE confirmations ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE confirmations DROP CONSTRAINT IF EXISTS confirmations_status_check;
ALTER TABLE confirmations ADD CONSTRAINT confirmations_status_check CHECK (status IN ('PENDING','PROCESSING','SUCCEEDED','FAILED_RETRYABLE','FAILED_FINAL','EXPIRED'));
UPDATE confirmations SET status='FAILED_FINAL', completed_at=used_at WHERE used_at IS NOT NULL AND status='PENDING';
CREATE INDEX IF NOT EXISTS confirmations_status_idx ON confirmations(status, expires_at);

ALTER TABLE confirmation_executions ADD COLUMN IF NOT EXISTS confirmation_id TEXT REFERENCES confirmations(id);
ALTER TABLE confirmation_executions ADD COLUMN IF NOT EXISTS actor_id TEXT;
ALTER TABLE confirmation_executions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE confirmation_executions ADD COLUMN IF NOT EXISTS payload_hash TEXT;
ALTER TABLE confirmation_executions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PROCESSING';
ALTER TABLE confirmation_executions ALTER COLUMN result DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS confirmation_execution_identity_idx ON confirmation_executions(confirmation_id, idempotency_key);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS payload_hash TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE payment_refunds DROP CONSTRAINT IF EXISTS payment_refunds_status_check;
ALTER TABLE payment_refunds ADD CONSTRAINT payment_refunds_status_check CHECK (status IN ('PENDING','SUCCEEDED','FAILED'));
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS payload_hash TEXT;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS idempotency_records (
  scope TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  resource_id TEXT,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, actor_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS workflow_reconciliation (
  order_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  status TEXT NOT NULL,
  last_error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
