BEGIN;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS confirmation_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS confirmation_execution_key TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS conversation_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS recovery_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS next_recovery_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS last_recovery_error TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS recovered_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS payments_recovery_due_idx
  ON payments(status, next_recovery_at)
  WHERE status IN ('PENDING', 'TIMED_OUT', 'UNKNOWN');

ALTER TABLE payment_refunds DROP CONSTRAINT IF EXISTS payment_refunds_status_check;
ALTER TABLE payment_refunds ADD CONSTRAINT payment_refunds_status_check
  CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'UNKNOWN'));
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS provider_refund_reference TEXT;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS payment_provider_reference TEXT;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS provider_status TEXT;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS status_available_at TIMESTAMPTZ;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS refund_scope TEXT NOT NULL DEFAULT 'FOOD_ORDER_FINAL_REFUND';
CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_canonical_scope_idx
  ON payment_refunds(payment_id, refund_scope);

CREATE TABLE IF NOT EXISTS sandbox_payment_provider_transactions (
  provider_reference TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id),
  actor_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  provider_status TEXT NOT NULL CHECK (provider_status IN ('CREATED','PENDING','SUCCEEDED','FAILED','UNKNOWN')),
  intended_final_status TEXT CHECK (intended_final_status IN ('SUCCEEDED','FAILED','UNKNOWN')),
  confirmation_id TEXT,
  execution_key TEXT,
  confirm_attempted_at TIMESTAMPTZ,
  status_available_at TIMESTAMPTZ,
  last_status_check_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sandbox_payment_provider_recovery_idx
  ON sandbox_payment_provider_transactions(provider_status, status_available_at);

CREATE TABLE IF NOT EXISTS sandbox_payment_provider_refunds (
  provider_refund_reference TEXT PRIMARY KEY,
  refund_id TEXT NOT NULL UNIQUE REFERENCES payment_refunds(id),
  payment_provider_reference TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  provider_status TEXT NOT NULL CHECK (provider_status IN ('PENDING','SUCCEEDED','FAILED','UNKNOWN')),
  attempted_at TIMESTAMPTZ,
  status_available_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE conversation_states ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE workflow_reconciliation ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE workflow_reconciliation ADD COLUMN IF NOT EXISTS claim_owner TEXT;
ALTER TABLE workflow_reconciliation ADD COLUMN IF NOT EXISTS refund_scope TEXT NOT NULL DEFAULT 'FOOD_ORDER_FINAL_REFUND';
CREATE INDEX IF NOT EXISTS workflow_reconciliation_claim_idx
  ON workflow_reconciliation(completed_at, next_attempt_at, claimed_at);

COMMIT;
