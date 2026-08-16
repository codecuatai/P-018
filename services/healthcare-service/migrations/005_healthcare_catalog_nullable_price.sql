-- Source catalogs may omit consultation price. Preserve that fact instead of
-- manufacturing a zero-price doctor; the booking route rejects such doctors
-- until a real price is available.
BEGIN;

ALTER TABLE doctors ALTER COLUMN price DROP NOT NULL;

COMMIT;
