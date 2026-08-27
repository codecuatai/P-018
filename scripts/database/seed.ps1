$ErrorActionPreference = 'Stop'
$envFile = if ($args.Count -gt 0) { $args[0] } elseif (Test-Path .env) { '.env' } else { '.env.example' }

python scripts/data/catalog/catalog_import.py food --apply
if ($LASTEXITCODE -ne 0) { throw 'Food catalog import failed.' }
python scripts/data/catalog/catalog_import.py restaurant --apply
if ($LASTEXITCODE -ne 0) { throw 'Restaurant catalog import failed.' }
python scripts/data/catalog/catalog_import.py healthcare --apply
if ($LASTEXITCODE -ne 0) { throw 'Healthcare catalog import failed.' }
docker compose --env-file $envFile exec -T restaurant-service python -m seeds.seed
if ($LASTEXITCODE -ne 0) { throw 'Restaurant booking-resource seed failed.' }
Write-Host 'Restaurant booking resources applied to imported catalog rows.'
