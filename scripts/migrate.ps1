$ErrorActionPreference = 'Stop'
Write-Host 'Applying Restaurant Service migrations...'
docker compose exec -T restaurant-service alembic upgrade head
if ($LASTEXITCODE -ne 0) { throw 'Restaurant Service migration failed.' }
Write-Host 'Restaurant Service migrations applied.'
