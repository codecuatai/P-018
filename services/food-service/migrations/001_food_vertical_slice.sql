-- Food Service owns this schema. Run against xone_food after the logical database exists.
BEGIN;
CREATE TABLE IF NOT EXISTS food_catalog (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL CHECK (record_type IN ('restaurant', 'menu_item', 'voucher', 'address', 'driver')),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS food_carts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, restaurant_id TEXT NOT NULL, data JSONB NOT NULL,
  idempotency_key TEXT, version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS food_orders (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, status TEXT NOT NULL, idempotency_key TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL, amount INTEGER NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'VND', data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (user_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS food_order_status_events (
  id BIGSERIAL PRIMARY KEY, order_id TEXT NOT NULL REFERENCES food_orders(id), from_status TEXT, to_status TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), reason TEXT NOT NULL, actor_type TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS food_catalog_type_idx ON food_catalog(record_type);
CREATE INDEX IF NOT EXISTS food_orders_status_idx ON food_orders(status);
CREATE INDEX IF NOT EXISTS food_carts_user_idx ON food_carts(user_id);
COMMIT;
