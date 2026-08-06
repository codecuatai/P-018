# New Service Checklist

1. Create source, Dockerfile, standalone `.env.example`, tests, migrations, and seeds.
2. Add root environment variables, explicit Compose mapping, database URL, bootstrap database/user, health endpoints, config validation, and CI/root scripts.
3. Add gateway typed client/config/fixture; never give gateway a domain DB connection.
4. Define OpenAPI location, contract, unit/config/API tests, and deterministic seed/migration ownership.
5. Update README/services README, diagrams, service boundaries, data/runtime architecture, project status, port list, and `AGENTS.md` applicability.
6. Run validator, Compose config, package/import smoke, relevant lint/test/build, and document limits honestly.
