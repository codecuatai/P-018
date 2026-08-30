param([string]$EnvFile)

$ErrorActionPreference = 'Stop'
$envFile = if ($EnvFile) { $EnvFile } elseif (Test-Path .env) { '.env' } else { '.env.example' }

function Invoke-CatalogImport {
    param([Parameter(Mandatory = $true)][string]$Domain)

    docker compose --env-file $envFile run --rm --no-deps --build -T catalog-importer $Domain --apply
    if ($LASTEXITCODE -ne 0) { throw "$Domain catalog import failed." }
}

Invoke-CatalogImport -Domain 'food'
Invoke-CatalogImport -Domain 'restaurant'
Invoke-CatalogImport -Domain 'healthcare'
docker compose --env-file $envFile exec -T healthcare-service python -m seeds.seed_demo_patient
if ($LASTEXITCODE -ne 0) { throw 'Healthcare demo patient seed failed.' }
docker compose --env-file $envFile exec -T restaurant-service python -m seeds.seed
if ($LASTEXITCODE -ne 0) { throw 'Restaurant booking-resource seed failed.' }
docker compose --env-file $envFile exec -T ride-service python -m seeds.seed_demo_drivers
if ($LASTEXITCODE -ne 0) { throw 'Ride driver seed failed.' }
Write-Host 'Food, Restaurant, Healthcare, and Ride development data applied.'
