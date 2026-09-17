param([string]$EnvFile)

$ErrorActionPreference = 'Stop'
$envFile = if ($EnvFile) { $EnvFile } elseif (Test-Path .env) { '.env' } else { '.env.example' }

function Invoke-CatalogImport {
    param([Parameter(Mandatory = $true)][string]$Domain)

    docker compose --env-file $envFile run --rm --no-deps --build -T catalog-importer $Domain --apply
    if ($LASTEXITCODE -ne 0) { throw "$Domain catalog import failed." }
}

Write-Host 'Domain services seed data (Food, Restaurant, Healthcare, Ride) is managed in P-018-Service.' -ForegroundColor Yellow
Write-Host 'Please run .\scripts\database\seed.ps1 inside P-018-Service repository.' -ForegroundColor Cyan
