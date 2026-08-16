BEGIN;

-- Admin support updates are side effects too. Keep their normalized request
-- hash beside the ticket event so retries replay safely and key conflicts are
-- rejected without introducing a cross-domain table.
ALTER TABLE support_ticket_events
  ADD COLUMN IF NOT EXISTS request_hash TEXT;

COMMIT;
