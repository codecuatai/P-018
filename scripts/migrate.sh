#!/usr/bin/env sh
set -eu
env_file='.env'
[ -f "$env_file" ] || env_file='.env.example'
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/001_core_vertical_slice.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/002_core_persistence_slice.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/003_core_atomicity.sql
docker compose --env-file "$env_file" exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1 < services/food-service/migrations/001_food_vertical_slice.sql
docker compose --env-file "$env_file" exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1 < services/food-service/migrations/002_food_workflow_concurrency.sql
docker compose --env-file "$env_file" exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1 < services/food-service/migrations/003_food_atomicity.sql
echo 'Core and Food migrations applied.'
