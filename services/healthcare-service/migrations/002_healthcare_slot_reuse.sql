-- Allow cancelled/expired appointment history while preserving one active appointment per slot.
BEGIN;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_slot_id_key;
DROP INDEX IF EXISTS appointments_slot_id_key;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED', 'EXPIRED'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_active_slot
  ON appointments (slot_id)
  WHERE status IN ('DRAFT', 'CONFIRMED');

COMMIT;
