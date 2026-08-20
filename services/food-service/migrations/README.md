# Migrations

Run `001_food_vertical_slice.sql` through
`007_food_cart_write_idempotency.sql` against `xone_food`. The additive
migrations add due-workflow claims, normalized driver locking, voucher
redemptions, cart/order versions, transaction indexes, transition and cart-write
operation idempotency, cart payload hashes, voucher eligibility indexes,
actor-scoped address discovery, and versioned catalog provenance without
rewriting earlier migrations. `scripts/dataops/catalog_import.py food --apply`
is the explicit import path after the migrations are applied.
