# Integration Tests

The live persistence suites are owned by their services: Food runs `services/food-service/tests/test_postgres_integration.py` with a disposable `FOOD_TEST_DATABASE_URL`, and Gateway runs `apps/api-gateway/test/core.postgres.integration.spec.ts` with `CORE_TEST_DATABASE_URL`. CI provisions PostgreSQL and runs both suites without skip conditions.
