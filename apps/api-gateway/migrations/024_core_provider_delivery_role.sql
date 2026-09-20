BEGIN;

ALTER TABLE provider_profiles DROP CONSTRAINT IF EXISTS provider_profiles_provider_type_check;
ALTER TABLE provider_profiles
  ADD CONSTRAINT provider_profiles_provider_type_check
  CHECK (provider_type IN ('ride_driver', 'restaurant_merchant', 'healthcare_doctor', 'delivery_courier'));

COMMIT;
