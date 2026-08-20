BEGIN;

CREATE TABLE IF NOT EXISTS food_cart_write_operations (
  actor_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  cart_id TEXT NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS food_cart_write_operations_created_at_idx
  ON food_cart_write_operations (created_at);

COMMIT;
