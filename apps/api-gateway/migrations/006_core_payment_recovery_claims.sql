BEGIN;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS recovery_claimed_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS recovery_claim_owner TEXT;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS recovery_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS next_recovery_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS payments_recovery_claim_idx
  ON payments(status, next_recovery_at, recovery_claimed_at)
  WHERE status IN ('PENDING', 'TIMED_OUT', 'UNKNOWN');

COMMIT;
