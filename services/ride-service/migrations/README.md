# Ride migrations

Ride owns these revisions and applies them only to `xone_ride`.

From the Ride service directory, run `alembic upgrade head`. The first
revision creates quote, booking, one-time confirmation-consumption, and
idempotency tables. Later revisions add route/driver data and the explicit
quote and booking lifecycle. Runtime startup never creates or mutates schema.
Revision `20260816_0006` additively binds `passenger_count` and the capacity
policy version to quote and booking snapshots. Existing rows remain compatible
as one-passenger transactions.
