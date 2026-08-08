BEGIN;

ALTER TABLE food_carts ADD COLUMN IF NOT EXISTS payload_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS food_carts_actor_idempotency_idx
  ON food_carts(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS food_voucher_redemptions_user_code_idx
  ON food_voucher_redemptions(user_id, voucher_code);
CREATE INDEX IF NOT EXISTS food_order_operations_lookup_idx
  ON food_order_operations(order_id, operation_key);
ALTER TABLE food_order_operations ADD COLUMN IF NOT EXISTS payload_hash TEXT;

COMMIT;
