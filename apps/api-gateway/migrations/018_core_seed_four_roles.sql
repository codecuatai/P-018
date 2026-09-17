BEGIN;

-- Deterministic seed for standard 4-role accounts:
-- admin@xone.local    (role: admin)
-- manager@xone.local  (role: manager)
-- provider@xone.local (role: provider)
-- user@xone.local     (role: user)
-- All accounts use standard test password: Password123!
-- Argon2id hash: $argon2id$v=19$m=19456,t=2,p=1$MMjzpxgSfRFp7v2WcKX1Sw$BfBOJsYyIQiz/Jh+a3H2p/lvdtsuQISTaIN5DOTzPzM

INSERT INTO users (id, email, email_normalized, full_name, phone, role, status, created_at, updated_at)
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'admin@xone.local', 'admin@xone.local', 'X-One System Admin', '0901000001', 'admin', 'active', now(), now()),
  ('a0000000-0000-4000-8000-000000000002', 'manager@xone.local', 'manager@xone.local', 'X-One Operations Manager', '0901000002', 'manager', 'active', now(), now()),
  ('a0000000-0000-4000-8000-000000000003', 'provider@xone.local', 'provider@xone.local', 'X-One Service Partner', '0901000003', 'provider', 'active', now(), now()),
  ('a0000000-0000-4000-8000-000000000004', 'user@xone.local', 'user@xone.local', 'X-One Standard User', '0901000004', 'user', 'active', now(), now())
ON CONFLICT (email_normalized) DO NOTHING;

INSERT INTO user_credentials (user_id, password_hash, password_changed_at, created_at, updated_at)
VALUES
  ('a0000000-0000-4000-8000-000000000001', '$argon2id$v=19$m=19456,t=2,p=1$MMjzpxgSfRFp7v2WcKX1Sw$BfBOJsYyIQiz/Jh+a3H2p/lvdtsuQISTaIN5DOTzPzM', now(), now(), now()),
  ('a0000000-0000-4000-8000-000000000002', '$argon2id$v=19$m=19456,t=2,p=1$MMjzpxgSfRFp7v2WcKX1Sw$BfBOJsYyIQiz/Jh+a3H2p/lvdtsuQISTaIN5DOTzPzM', now(), now(), now()),
  ('a0000000-0000-4000-8000-000000000003', '$argon2id$v=19$m=19456,t=2,p=1$MMjzpxgSfRFp7v2WcKX1Sw$BfBOJsYyIQiz/Jh+a3H2p/lvdtsuQISTaIN5DOTzPzM', now(), now(), now()),
  ('a0000000-0000-4000-8000-000000000004', '$argon2id$v=19$m=19456,t=2,p=1$MMjzpxgSfRFp7v2WcKX1Sw$BfBOJsYyIQiz/Jh+a3H2p/lvdtsuQISTaIN5DOTzPzM', now(), now(), now())
ON CONFLICT (user_id) DO NOTHING;

-- Ensure provider profile for provider@xone.local
INSERT INTO provider_profiles (user_id, provider_type, tenant_id, status, created_at, updated_at)
VALUES
  ('a0000000-0000-4000-8000-000000000003', 'ride_driver', 'partner-xone-01', 'active', now(), now())
ON CONFLICT (user_id) DO NOTHING;

-- Align any existing test-registered accounts
UPDATE users SET role = 'manager' WHERE email_normalized = 'manager.test@x-one.local';
UPDATE users SET role = 'provider' WHERE email_normalized = 'provider.test@x-one.local';
UPDATE users SET role = 'user' WHERE email_normalized IN ('user.test@x-one.local', 'customer.test@x-one.local');

COMMIT;
