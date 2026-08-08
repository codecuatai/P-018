BEGIN;

CREATE TABLE IF NOT EXISTS food_order_operations (
  order_id TEXT NOT NULL REFERENCES food_orders(id),
  operation_key TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  target_status TEXT,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, operation_key)
);
CREATE INDEX IF NOT EXISTS food_order_operations_order_idx
  ON food_order_operations(order_id, created_at);

ALTER TABLE food_drivers ADD COLUMN IF NOT EXISTS assigned_order_id TEXT;
CREATE INDEX IF NOT EXISTS food_drivers_assigned_order_idx
  ON food_drivers(assigned_order_id)
  WHERE assigned_order_id IS NOT NULL;

COMMIT;
