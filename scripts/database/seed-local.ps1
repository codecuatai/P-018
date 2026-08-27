param([string]$EnvFile = ".env")

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$envPath = (Resolve-Path (Join-Path $repoRoot $EnvFile)).Path

function Invoke-LocalPython {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("food", "ride", "restaurant", "healthcare")][string]$Kind,
        [Parameter(Mandatory = $true)][string]$DatabaseKey,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $argumentsJson = ConvertTo-Json -InputObject @($Arguments) -Compress
    $argumentsBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($argumentsJson))
    & powershell.exe -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts\local\local-process.ps1") -EnvFile $envPath -WorkingDirectory (Join-Path $repoRoot $WorkingDirectory) -FilePath "python" -ServiceKind $Kind -LocalHostMode -DatabaseKey $DatabaseKey -CommandArgumentsBase64 $argumentsBase64
    if ($LASTEXITCODE -ne 0) { throw "$Kind local seed failed." }
}

Push-Location $repoRoot
try {
    if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) { throw "Environment file was not found: $EnvFile" }
    & python (Join-Path $repoRoot "scripts\data\catalog\catalog_import.py") food --apply
    if ($LASTEXITCODE -ne 0) { throw "Food catalog import failed." }
    & python (Join-Path $repoRoot "scripts\data\catalog\catalog_import.py") restaurant --apply
    if ($LASTEXITCODE -ne 0) { throw "Restaurant catalog import failed." }
    & python (Join-Path $repoRoot "scripts\data\catalog\catalog_import.py") healthcare --apply
    if ($LASTEXITCODE -ne 0) { throw "Healthcare catalog import failed." }
    Invoke-LocalPython -Kind "restaurant" -DatabaseKey "RESTAURANT_DATABASE_URL" -WorkingDirectory "services\restaurant-service" -Arguments @("-m", "seeds.seed")
    Write-Host "Local discovery catalogs imported into PostgreSQL without fixed Food, Restaurant, Healthcare, or Ride demo records."
} finally {
    Pop-Location
}
