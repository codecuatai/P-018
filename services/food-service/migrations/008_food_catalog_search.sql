-- Food-owned normalized search text for the active catalog.
-- The source JSON remains the public catalog payload; this maintained column
-- exists only to keep accent-insensitive discovery inside PostgreSQL.
BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE food_catalog ADD COLUMN IF NOT EXISTS search_text TEXT;

UPDATE food_catalog
SET search_text = unaccent(lower(concat_ws(
  ' ',
  COALESCE(data->>'name', ''),
  COALESCE(data->>'category', ''),
  COALESCE(data->>'description', '')
)))
WHERE record_type IN ('restaurant', 'menu_item');

CREATE INDEX IF NOT EXISTS food_catalog_menu_search_trgm_idx
  ON food_catalog USING gin (search_text gin_trgm_ops)
  WHERE record_type = 'menu_item' AND is_active = TRUE;

COMMIT;
