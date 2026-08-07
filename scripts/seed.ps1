$ErrorActionPreference = 'Stop'
Write-Host 'Applying deterministic Restaurant Service seeds...'
docker compose exec -T restaurant-service python -m seeds.seed
if ($LASTEXITCODE -ne 0) { throw 'Restaurant Service seed failed.' }
Write-Host 'Restaurant Service seeds applied.'
