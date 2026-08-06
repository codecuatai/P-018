# Migrations

Run `001_food_vertical_slice.sql`, `002_food_workflow_concurrency.sql`, `003_food_atomicity.sql`, and `004_food_authoritative_operations.sql` against `xone_food`. The additive migrations add due-workflow claims, normalized driver locking, voucher redemptions, cart/order versions, transaction indexes, and transition operation idempotency without rewriting earlier migrations.
