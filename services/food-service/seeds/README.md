# Seeds

The demo seed is deterministic, Vietnamese, and scoped to Hà Nội. Run `scripts/seed.ps1` or `scripts/seed.sh` after the Food migration. The in-memory test repository contains the same stable identifiers for unit/API tests.

The CSV catalog import is additive and idempotent:

```bash
python -m seeds.import_food_csv --data-dir /app/import-data
```

It upserts restaurant, menu-item, and optional `food_location_aliases.csv` records by source ID without deleting existing demo data, carts, or orders. Location aliases are catalog-owned mappings from a public landmark name to the administrative area used by source records; add new rows as catalog coverage expands, rather than coding landmark names into the service. The source CSV does not include coordinates or live opening status, so imported restaurants use an approximate Hanoi-center location and remain discoverable/open for local demo flows.
