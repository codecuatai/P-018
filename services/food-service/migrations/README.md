# Migrations

Run `001_food_vertical_slice.sql` through `005_food_idempotency_eligibility.sql` against `xone_food`. The additive migrations add due-workflow claims, normalized driver locking, voucher redemptions, cart/order versions, transaction indexes, transition operation idempotency, cart payload hashes, and voucher eligibility indexes without rewriting earlier migrations.
