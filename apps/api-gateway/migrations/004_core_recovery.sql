BEGIN;

ALTER TABLE confirmations ADD COLUMN IF NOT EXISTS recovery_claimed_at TIMESTAMPTZ;
ALTER TABLE confirmations ADD COLUMN IF NOT EXISTS recovery_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE confirmations ADD COLUMN IF NOT EXISTS next_recovery_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS confirmations_recovery_due_idx
  ON confirmations(status, processing_started_at, next_recovery_at)
  WHERE status = 'PROCESSING';

ALTER TABLE confirmation_executions ADD COLUMN IF NOT EXISTS execution_payload JSONB;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_reference TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_status TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS payments_pending_recovery_idx
  ON payments(status, last_checked_at)
  WHERE status IN ('PENDING', 'TIMED_OUT', 'UNKNOWN');

ALTER TABLE workflow_reconciliation ADD COLUMN IF NOT EXISTS refund_id TEXT;
ALTER TABLE workflow_reconciliation ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_reconciliation ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
ALTER TABLE workflow_reconciliation ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS workflow_reconciliation_due_idx
  ON workflow_reconciliation(next_attempt_at)
  WHERE completed_at IS NULL;

COMMIT;
