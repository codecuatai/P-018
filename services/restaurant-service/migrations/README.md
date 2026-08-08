# Migrations

Restaurant owns the Alembic chain `versions/0001_restaurant_booking.py` followed by additive `versions/0002_restaurant_idempotency_records.py` (revision `0002_restaurant_idempotency`). The second revision adds durable actor/operation/key response snapshots and keeps the legacy reservation idempotency columns for compatibility. Run `alembic upgrade head` from this service directory with `DATABASE_URL` set. Runtime startup does not create or alter schema.
