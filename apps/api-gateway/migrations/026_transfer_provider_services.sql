BEGIN;

-- Move Ride and Food from the secondary provider account to the primary
-- provider account. Keep every service explicit so the repository mapper's
-- defaults cannot accidentally re-enable a transferred service.
UPDATE provider_profiles
SET connected_services = '{"ride": false, "food": false, "restaurant": true, "healthcare": true, "delivery": true}'::jsonb,
    updated_at = now()
WHERE user_id = (SELECT id FROM users WHERE email_normalized = 'provider1@xone.local');

UPDATE provider_profiles
SET tenant_id = 'partner-xone-02',
    status = 'active',
    business_name = CASE
      WHEN business_name IS NULL OR business_name = 'Tài Khoản Đã Ngắt Kết Nối' THEN 'Đối tác X-One'
      ELSE business_name
    END,
    is_open = true,
    connected_services = '{"ride": true, "food": true, "restaurant": false, "healthcare": false, "delivery": false}'::jsonb,
    updated_at = now()
WHERE user_id = (SELECT id FROM users WHERE email_normalized = 'provider@xone.local');

COMMIT;
