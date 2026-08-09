BEGIN;

-- One durable receipt belongs to one actor/conversation/action.  The action
-- identity is intentionally one-time: a different Idempotency-Key cannot
-- resurrect an action after its original execution has been consumed.
CREATE TABLE IF NOT EXISTS assistant_action_executions (
  actor_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'SUCCEEDED', 'FAILED_FINAL')),
  response_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (actor_id, conversation_id, action_id),
  UNIQUE (actor_id, conversation_id, action_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS assistant_action_executions_replay_idx
  ON assistant_action_executions(actor_id, conversation_id, action_id, idempotency_key);

COMMIT;
