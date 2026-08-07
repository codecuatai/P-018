#!/usr/bin/env sh
set -eu
env_file="${1:-.env}"
[ -f "$env_file" ] || env_file='.env.example'
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/001_core_vertical_slice.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/002_core_persistence_slice.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/003_core_atomicity.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/004_core_recovery.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/005_core_payment_provider_saga.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/006_core_payment_recovery_claims.sql
docker compose --env-file "$env_file" exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1 < services/food-service/migrations/001_food_vertical_slice.sql
docker compose --env-file "$env_file" exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1 < services/food-service/migrations/002_food_workflow_concurrency.sql
docker compose --env-file "$env_file" exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1 < services/food-service/migrations/003_food_atomicity.sql
docker compose --env-file "$env_file" exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1 < services/food-service/migrations/004_food_authoritative_operations.sql
docker compose --env-file "$env_file" exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1 < services/food-service/migrations/005_food_idempotency_eligibility.sql
echo 'Core and Food migrations applied.'
docker compose --env-file "$env_file" exec -T restaurant-service alembic upgrade head
echo 'Restaurant Service migrations applied.'
docker compose --env-file "$env_file" exec -T postgres psql -U healthcare_user -d xone_healthcare -v ON_ERROR_STOP=1 < services/healthcare-service/migrations/001_healthcare_booking.sql
echo 'Healthcare Service migrations applied.'
