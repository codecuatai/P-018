# Database and Migrations

The local PostgreSQL initialization script receives database names, owners, and passwords through explicit Compose environment mappings. It creates six logical databases with distinct owners and never grants cross-service access.

Files in `/docker-entrypoint-initdb.d` run only when PostgreSQL initializes a new `postgres_data` volume. Changing `.env` later does not update an existing volume. Apply deliberate migrations/role changes for an existing database; do not delete a user's volume automatically. Food and Core have explicit owned migrations through `003_core_atomicity.sql` and `003_food_atomicity.sql`. Run `scripts/migrate.ps1`/`.sh`, then `scripts/seed.ps1`/`.sh`; neither script deletes volumes or resets data. Food Compose runs against PostgreSQL when `FOOD_PERSISTENCE=postgres`. Core application tests use an in-memory adapter for speed, while explicit PostgreSQL persistence tests are available through `CORE_TEST_DATABASE_URL`.
