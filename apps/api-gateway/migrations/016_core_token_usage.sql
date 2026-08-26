BEGIN;

CREATE TABLE IF NOT EXISTS agent_token_usage (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  model TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google',
  feature TEXT NOT NULL CHECK (feature IN ('assistant','ride','food','restaurant','healthcare','other')),
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12,8),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_token_usage_recorded_idx ON agent_token_usage(recorded_at DESC, feature);
CREATE INDEX IF NOT EXISTS agent_token_usage_actor_idx ON agent_token_usage(actor_id, recorded_at DESC);

COMMIT;
