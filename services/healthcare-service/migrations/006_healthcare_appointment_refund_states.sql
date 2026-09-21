-- Add refund-aware cancellation states without changing active slot ownership.
BEGIN;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'PENDING_REFUND', 'REFUNDED'));

COMMIT;
