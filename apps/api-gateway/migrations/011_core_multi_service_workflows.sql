BEGIN;

-- Gateway/Core owns orchestration state and idempotency evidence. Domain
-- services remain authoritative for their own bookings, orders, and holds.
CREATE TABLE IF NOT EXISTS multi_service_workflows (
  workflow_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('restaurant_ride', 'healthcare_ride', 'food_healthcare')),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL_SUCCESS', 'FAILED', 'COMPENSATING', 'RECOVERY_REQUIRED')),
  plan JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (actor_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS multi_service_workflows_actor_updated_idx
  ON multi_service_workflows(actor_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS multi_service_workflows_recovery_idx
  ON multi_service_workflows(status, updated_at ASC)
  WHERE status IN ('RUNNING', 'COMPENSATING', 'RECOVERY_REQUIRED');

COMMIT;
