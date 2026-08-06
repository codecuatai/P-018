$envFile = if (Test-Path .env) { '.env' } else { '.env.example' }
Get-Content 'services/food-service/seeds/001_demo_hanoi.sql' | docker compose --env-file $envFile exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1
Write-Host 'Deterministic Food demo seed applied.'
