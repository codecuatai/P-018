$ErrorActionPreference = 'Stop'
$envFile = if ($args.Count -gt 0) { $args[0] } elseif (Test-Path .env) { '.env' } else { '.env.example' }
Get-Content 'services/food-service/seeds/001_demo_hanoi.sql' | docker compose --env-file $envFile exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1
Write-Host 'Deterministic Food demo seed applied.'
docker compose --env-file $envFile exec -T restaurant-service python -m seeds.seed
if ($LASTEXITCODE -ne 0) { throw 'Restaurant Service seed failed.' }
Write-Host 'Restaurant Service seeds applied.'
docker compose --env-file $envFile exec -T healthcare-service python -m seeds.seed_medical
if ($LASTEXITCODE -ne 0) { throw 'Healthcare Service seed failed.' }
Write-Host 'Healthcare Service seeds applied.'
