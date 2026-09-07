BEGIN;

-- Expand the allowed roles on the users table to support the 4-tier model:
-- user (with customer alias for backward compatibility), manager, provider, admin.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'customer', 'manager', 'provider', 'admin'));

-- Provider profiles map provider accounts to a specific domain role and merchant/driver/doctor ID.
CREATE TABLE IF NOT EXISTS provider_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('ride_driver', 'restaurant_merchant', 'healthcare_doctor')),
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_profiles_tenant_idx
  ON provider_profiles(provider_type, tenant_id);

COMMIT;
