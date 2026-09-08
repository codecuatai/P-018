BEGIN;

-- Audit trail for sensitive administrative and provider operations
CREATE TABLE IF NOT EXISTS system_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_audit_logs_actor_idx ON system_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS system_audit_logs_action_idx ON system_audit_logs(action, created_at DESC);

-- Dynamic feature flags for real-time service maintenance & control
CREATE TABLE IF NOT EXISTS system_feature_flags (
  flag_key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Seed initial feature flags
INSERT INTO system_feature_flags (flag_key, enabled, description)
VALUES 
  ('ride_service_enabled', true, 'Điều phối dịch vụ Chuyến xe (Ride Service)'),
  ('food_service_enabled', true, 'Điều phối dịch vụ Ẩm thực (Food Service)'),
  ('restaurant_service_enabled', true, 'Điều phối dịch vụ Đặt bàn (Restaurant Service)'),
  ('healthcare_service_enabled', true, 'Điều phối dịch vụ Khám bệnh (Healthcare Service)'),
  ('proactive_ai_suggestions', true, 'Banner gợi ý thông minh dựa trên ngữ cảnh thời tiết & sức khỏe'),
  ('multi_service_timeline', true, 'Hiển thị Visual Journey Timeline cho kế hoạch đa dịch vụ')
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
