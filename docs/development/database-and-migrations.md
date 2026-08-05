# Database and Migrations

The local PostgreSQL initialization script receives database names, owners, and passwords through explicit Compose environment mappings. It creates six logical databases with distinct owners and never grants cross-service access.

Files in `/docker-entrypoint-initdb.d` run only when PostgreSQL initializes a new `postgres_data` volume. Changing `.env` later does not update an existing volume. Apply deliberate migrations/role changes for an existing database; do not delete a user's volume automatically. Migrations and deterministic seeds remain service-owned scaffolds until the first domain schema is introduced.
