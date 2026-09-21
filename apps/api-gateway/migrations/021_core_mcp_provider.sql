BEGIN;

-- Mở rộng provider CHECK để chấp nhận API Key MCP (xone_mcp_...)
ALTER TABLE api_key_records DROP CONSTRAINT IF EXISTS api_key_records_provider_check;
ALTER TABLE api_key_records
  ADD CONSTRAINT api_key_records_provider_check
  CHECK (provider IN ('gemini','trello','geoapify','google_maps','other','mcp'));

-- Bật/tắt MCP + endpoint MCP ngoài (chiều Client) trên hồ sơ provider
ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS mcp_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mcp_endpoint_url TEXT;

-- Cấu hình MCP Server của đối tác lớn (agent-service đóng vai MCP Client gọi ra)
CREATE TABLE IF NOT EXISTS mcp_provider_configs (
  provider_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mcp_url TEXT NOT NULL,
  api_key_ref TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  allowed_tools TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảng API Key MCP (hash SHA-256, chỉ hiện raw key 1 lần lúc tạo)
CREATE TABLE IF NOT EXISTS mcp_api_keys (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Claude Desktop MCP Key',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_api_keys_hash_idx ON mcp_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS mcp_api_keys_user_idx ON mcp_api_keys(user_id, status);

-- Seed demo: bật MCP + key demo cho primary master provider1@xone.local (Claude Desktop test ngay)
-- Raw key demo: xone_mcp_demo_secret_key_provider_001 (SHA-256 bên dưới)
UPDATE provider_profiles SET mcp_enabled = false WHERE user_id = 'a0000000-0000-4000-8000-000000000003';
UPDATE provider_profiles SET mcp_enabled = true WHERE user_id = 'a0000000-0000-4000-8000-000000000013';

INSERT INTO mcp_api_keys (id, user_id, key_hash, key_prefix, label, status)
VALUES (
  'b0000000-0000-4000-8000-000000000013',
  'a0000000-0000-4000-8000-000000000013',
  'b4fd41d81142f282e9c63121fac621ef6fcf6ea1d9d147779ae863d6ab7349bf',
  'xone_mcp_demo...013',
  'Primary Master Provider MCP Key',
  'active'
)
ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = now();

COMMIT;
