CREATE TABLE IF NOT EXISTS agent_workflow_states (
    actor_id VARCHAR(128) NOT NULL,
    workflow_id VARCHAR(128) NOT NULL,
    state JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (actor_id, workflow_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_wf_updated_at ON agent_workflow_states(updated_at);
