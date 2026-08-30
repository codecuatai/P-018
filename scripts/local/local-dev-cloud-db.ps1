param(
    [string]$EnvFile = ".env",
    [switch]$Migrate,
    [ValidateRange(20, 600)][int]$WaitSeconds = 90
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$sourceScript = Join-Path $PSScriptRoot "local-dev.ps1"
$generatedScript = Join-Path $PSScriptRoot ".local-dev-cloud-db.generated.ps1"

if (-not (Test-Path -LiteralPath $sourceScript -PathType Leaf)) {
    throw "scripts/local/local-dev.ps1 was not found."
}

$content = Get-Content -LiteralPath $sourceScript -Raw -Encoding UTF8

# Guard: refuse to patch an unexpected/newer local-dev.ps1.
$dockerRequirement = '    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker is required for the local PostgreSQL container." }'
$dockerStart = '    Invoke-Checked -FilePath "docker" -Arguments @("compose", "--env-file", $envPath, "up", "-d", "postgres") -FailureMessage "PostgreSQL could not be started."'
$postgresWait = '    Wait-TcpPort -Port ([int](Get-EnvironmentValue -Name "POSTGRES_PORT")) -Seconds $WaitSeconds'

foreach ($marker in @($dockerRequirement, $dockerStart, $postgresWait)) {
    if (-not $content.Contains($marker)) {
        throw "Unexpected scripts/local/local-dev.ps1 layout. Missing marker:`n$marker"
    }
}

# Remove ONLY local Docker/PostgreSQL bootstrap.
$content = $content.Replace(
    $dockerRequirement,
    '    Write-Host "External PostgreSQL mode: Docker bootstrap skipped." -ForegroundColor Cyan'
)
$content = $content.Replace($dockerStart, "")
$content = $content.Replace($postgresWait, "")

Set-Content `
    -LiteralPath $generatedScript `
    -Value $content `
    -Encoding UTF8

try {
    $arguments = @(
        "-ExecutionPolicy", "Bypass",
        "-File", $generatedScript,
        "-EnvFile", $EnvFile,
        "-WaitSeconds", "$WaitSeconds"
    )

    if ($Migrate) {
        $arguments += "-Migrate"
    }

    Write-Host "Starting X-One with external PostgreSQL from $EnvFile..." -ForegroundColor Cyan
    Write-Host "Docker will NOT be used." -ForegroundColor Cyan

    & powershell.exe @arguments

    if ($LASTEXITCODE -ne 0) {
        throw "Local X-One startup failed with exit code $LASTEXITCODE."
    }
}
finally {
    Remove-Item `
        -LiteralPath $generatedScript `
        -Force `
        -ErrorAction SilentlyContinue
}
