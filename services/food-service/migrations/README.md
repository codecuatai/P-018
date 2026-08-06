# Migrations

Run `001_food_vertical_slice.sql`, `002_food_workflow_concurrency.sql`, and `003_food_atomicity.sql` against `xone_food`. The additive migrations add due-workflow claims, normalized driver locking, voucher redemptions, cart/order versions, and transaction indexes without rewriting earlier migrations.
