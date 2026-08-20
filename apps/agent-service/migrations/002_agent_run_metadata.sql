BEGIN;

CREATE TABLE IF NOT EXISTS agent_run_metadata (
  actor_id VARCHAR(128) NOT NULL,
  workflow_id VARCHAR(128) NOT NULL,
  run_id VARCHAR(128) NOT NULL,
  phase VARCHAR(80) NOT NULL,
  schema_version VARCHAR(40) NOT NULL,
  capability_names TEXT[] NOT NULL DEFAULT '{}',
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 10),
  error_code VARCHAR(100),
  payload_hash CHAR(64) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, workflow_id, run_id),
  CHECK (cardinality(capability_names) <= 16)
);

CREATE INDEX IF NOT EXISTS agent_run_metadata_created_at_idx
  ON agent_run_metadata (created_at);

COMMENT ON TABLE agent_run_metadata IS
  'Allowlisted Agent run metadata only; never prompts, messages, reasoning, PII, or domain transaction facts.';

COMMIT;
