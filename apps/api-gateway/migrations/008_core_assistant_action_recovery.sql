BEGIN;

-- Add recovery semantics without changing the original receipt definition in
-- migration 007.  A processing lease makes a crashed worker reclaimable while
-- keeping the actor/conversation/action primary key one-time.
ALTER TABLE assistant_action_executions
  ADD COLUMN IF NOT EXISTS processing_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE assistant_action_executions
SET updated_at = COALESCE(updated_at, completed_at, created_at),
    processing_expires_at = CASE
      WHEN status = 'PROCESSING' THEN COALESCE(processing_expires_at, created_at + interval '30 seconds')
      ELSE NULL
    END;

ALTER TABLE assistant_action_executions
  DROP CONSTRAINT IF EXISTS assistant_action_executions_status_check;

ALTER TABLE assistant_action_executions
  ADD CONSTRAINT assistant_action_executions_status_check
  CHECK (status IN ('PROCESSING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_FINAL'));

CREATE INDEX IF NOT EXISTS assistant_action_executions_processing_lease_idx
  ON assistant_action_executions(status, processing_expires_at)
  WHERE status IN ('PROCESSING', 'FAILED_RETRYABLE');

COMMIT;
