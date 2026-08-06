BEGIN;

ALTER TABLE food_carts ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS food_orders_idempotency_idx
  ON food_orders(user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS food_order_events_order_time_idx
  ON food_order_status_events(order_id, occurred_at, id);

-- The normalized driver table is the authoritative driver store. Existing demo
-- catalog rows remain readable for compatibility, but new assignment code uses
-- this table and locks it until the order transition commits.
INSERT INTO food_drivers (id, data, available)
SELECT id, data, COALESCE((data->>'available')::boolean, true)
FROM food_catalog
WHERE record_type = 'driver'
ON CONFLICT (id) DO NOTHING;

COMMIT;
