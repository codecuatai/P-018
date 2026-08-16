# Core migrations

Core (owned by the API Gateway) holds confirmations, sandbox payments, refunds, receipts, conversations, idempotency evidence, reconciliation metadata, audit records, and durable Assistant action execution receipts. These are ordered raw-SQL files applied to `xone_core` as `core_user`. They are additive and never access another owner's tables.

| File | What it adds |
| --- | --- |
| `001_core_vertical_slice.sql` | First Core-owned schema |
| `002_core_persistence_slice.sql` | Durable persistence for the vertical slice |
| `003_core_atomicity.sql` | Atomic write guarantees |
| `004_core_recovery.sql` | Recovery state for interrupted operations |
| `005_core_payment_provider_saga.sql` | Durable provider transactions and saga fields |
| `006_core_payment_recovery_claims.sql` | Atomic payment-recovery claims and refund recovery scheduling |
| `007_core_assistant_action_executions.sql` | One safe public Assistant response per consumed actor/conversation/action, for exact same-key replay |
| `008_core_assistant_action_recovery.sql` | Retryable failure state and a bounded processing lease, without editing 007 |

Both `scripts/migrate.sh` and `scripts/migrate.ps1` apply the full cross-owner set in this order:

1. Core `001` → `008` (raw SQL, `xone_core`)
2. Food `001` → `005` (raw SQL, `xone_food`)
3. Restaurant `alembic upgrade head` (inside the `restaurant-service` container)
4. Healthcare `001` → `003` (raw SQL, `xone_healthcare`)
5. Ride `alembic upgrade head` (inside the `ride-service` container)

SQL is piped with `ON_ERROR_STOP=1`, and both runners are idempotent — re-running them is safe and neither deletes a volume. A new migration must be registered in **both** runners; run `python scripts/check-migration-parity.py` to detect drift before changing either script.
