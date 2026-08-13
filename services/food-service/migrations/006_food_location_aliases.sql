-- Food Service owns catalog landmark aliases. This expands only the owned
-- catalog record type constraint; existing catalog, carts, and orders remain.
BEGIN;
ALTER TABLE food_catalog DROP CONSTRAINT IF EXISTS food_catalog_record_type_check;
ALTER TABLE food_catalog ADD CONSTRAINT food_catalog_record_type_check
  CHECK (record_type IN ('restaurant', 'menu_item', 'voucher', 'address', 'driver', 'location_alias'));
COMMIT;
