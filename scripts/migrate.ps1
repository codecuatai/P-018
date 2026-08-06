if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is required to run migrations.' }
$envFile = if (Test-Path .env) { '.env' } else { '.env.example' }
Get-Content 'apps/api-gateway/migrations/001_core_vertical_slice.sql' | docker compose --env-file $envFile exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1
Get-Content 'apps/api-gateway/migrations/002_core_persistence_slice.sql' | docker compose --env-file $envFile exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1
Get-Content 'apps/api-gateway/migrations/003_core_atomicity.sql' | docker compose --env-file $envFile exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1
Get-Content 'services/food-service/migrations/001_food_vertical_slice.sql' | docker compose --env-file $envFile exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1
Get-Content 'services/food-service/migrations/002_food_workflow_concurrency.sql' | docker compose --env-file $envFile exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1
Get-Content 'services/food-service/migrations/003_food_atomicity.sql' | docker compose --env-file $envFile exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1
Write-Host 'Core and Food migrations applied.'
