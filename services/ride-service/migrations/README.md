# Ride migrations

Ride owns these revisions and applies them only to `xone_ride`.

From the Ride service directory, run `alembic upgrade head`. The first
revision creates quote, booking, one-time confirmation-consumption, and
idempotency tables. Runtime startup never creates or mutates schema.
