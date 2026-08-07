if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is required to run migrations.' }
$ErrorActionPreference = 'Stop'
$envFile = if ($args.Count -gt 0) { $args[0] } elseif (Test-Path .env) { '.env' } else { '.env.example' }
Get-Content 'apps/api-gateway/migrations/001_core_vertical_slice.sql' | docker compose --env-file $envFile exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1
Get-Content 'apps/api-gateway/migrations/002_core_persistence_slice.sql' | docker compose --env-file $envFile exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1
Get-Content 'apps/api-gateway/migrations/003_core_atomicity.sql' | docker compose --env-file $envFile exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1
Get-Content 'apps/api-gateway/migrations/004_core_recovery.sql' | docker compose --env-file $envFile exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1
Get-Content 'apps/api-gateway/migrations/005_core_payment_provider_saga.sql' | docker compose --env-file $envFile exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1
Get-Content 'apps/api-gateway/migrations/006_core_payment_recovery_claims.sql' | docker compose --env-file $envFile exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1
Get-Content 'services/food-service/migrations/001_food_vertical_slice.sql' | docker compose --env-file $envFile exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1
Get-Content 'services/food-service/migrations/002_food_workflow_concurrency.sql' | docker compose --env-file $envFile exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1
Get-Content 'services/food-service/migrations/003_food_atomicity.sql' | docker compose --env-file $envFile exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1
Get-Content 'services/food-service/migrations/004_food_authoritative_operations.sql' | docker compose --env-file $envFile exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1
Get-Content 'services/food-service/migrations/005_food_idempotency_eligibility.sql' | docker compose --env-file $envFile exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1
Write-Host 'Core and Food migrations applied.'
