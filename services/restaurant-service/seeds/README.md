# Seeds

The deterministic seed creates the four stable booking fixtures used by tests.
The CSV importer then performs an additive, idempotent upsert from the checked-in
catalog. It updates catalog fields and ensures tables/opening hours without
deleting reservations, holds, events, or idempotency evidence.

`seed.py` creates deterministic Restaurant-only restaurants, tables, and opening-hour data after migrations have been applied. It does not access another service/database.

Run from the repository root after the Compose stack is running:

```powershell
./scripts/migrate.ps1
./scripts/seed.ps1
```

Migrations and seeds are explicit operational steps. The service does not run schema changes automatically during application startup.
