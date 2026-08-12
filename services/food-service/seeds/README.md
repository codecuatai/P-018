# Seeds

The demo seed is deterministic, Vietnamese, and scoped to Hà Nội. Run `scripts/seed.ps1` or `scripts/seed.sh` after the Food migration. The in-memory test repository contains the same stable identifiers for unit/API tests.

The CSV catalog import is additive and idempotent:

```bash
python -m seeds.import_food_csv --data-dir /app/import-data
```

It upserts restaurant and menu-item records by source ID without deleting existing demo data, carts, or orders. The source CSV does not include coordinates or live opening status, so imported restaurants use an approximate Hanoi-center location and remain discoverable/open for local demo flows.
