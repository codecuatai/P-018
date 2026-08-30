# Migrations

Run `001_food_vertical_slice.sql` through
`008_food_catalog_search.sql` against `xone_food`. The additive migrations add
due-workflow claims, normalized driver locking, voucher redemptions, cart/order
versions, transaction indexes, transition and cart-write operation idempotency,
cart payload hashes, voucher eligibility indexes, actor-scoped address
discovery, versioned catalog provenance, and a Food-owned accent-insensitive
menu search column/index without rewriting earlier migrations.
`scripts/data/catalog/catalog_import.py food --apply` is the explicit import
path after the migrations are applied.
