BEGIN;

ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS next_transition_at TIMESTAMPTZ;
ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS workflow_scenario TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS restaurant_decision TEXT;
ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS workflow_completed_at TIMESTAMPTZ;
ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS driver_id TEXT;
CREATE INDEX IF NOT EXISTS food_orders_due_workflow_idx ON food_orders(next_transition_at) WHERE next_transition_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS food_voucher_redemptions (
  id BIGSERIAL PRIMARY KEY,
  voucher_code TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES food_orders(id),
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (voucher_code, order_id),
  UNIQUE (voucher_code, user_id)
);

CREATE TABLE IF NOT EXISTS food_drivers (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_drivers_available_idx ON food_drivers(available) WHERE available = TRUE;

ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS cancellation_idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS food_orders_cancel_key_idx
  ON food_orders(user_id, cancellation_idempotency_key)
  WHERE cancellation_idempotency_key IS NOT NULL;

COMMIT;
