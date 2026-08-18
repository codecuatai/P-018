# Seeds

`seed.py` creates deterministic Restaurant-only tables and opening-hour data after migrations have been applied. If an imported catalog already exists, it preserves those restaurant rows and adds only missing booking resources; it does not access another service/database.

Run from the repository root after the Compose stack is running:

```powershell
./scripts/migrate.ps1
./scripts/seed.ps1
```

Migrations and seeds are explicit operational steps. The service does not run schema changes automatically during application startup.
